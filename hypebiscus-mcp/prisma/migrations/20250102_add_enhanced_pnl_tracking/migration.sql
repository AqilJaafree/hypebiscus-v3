-- Migration: Enhanced PnL Tracking with Historical Prices
-- Date: 2025-01-02
-- Description: Adds production-grade PnL tracking with deposit/withdrawal prices,
--              IL calculation, and transaction history

-- ═══════════════════════════════════════════════════════════════════
-- STEP 1: Add new PnL tracking fields to positions table
-- ═══════════════════════════════════════════════════════════════════

-- Deposit tracking (prices at deposit time)
ALTER TABLE positions ADD COLUMN IF NOT EXISTS deposit_value_usd DECIMAL(20, 8);
ALTER TABLE positions ADD COLUMN IF NOT EXISTS deposit_token_x_price DECIMAL(20, 8);
ALTER TABLE positions ADD COLUMN IF NOT EXISTS deposit_token_y_price DECIMAL(20, 8);

-- Withdraw tracking (prices at withdrawal time)
ALTER TABLE positions ADD COLUMN IF NOT EXISTS withdraw_value_usd DECIMAL(20, 8);
ALTER TABLE positions ADD COLUMN IF NOT EXISTS withdraw_token_x_price DECIMAL(20, 8);
ALTER TABLE positions ADD COLUMN IF NOT EXISTS withdraw_token_y_price DECIMAL(20, 8);

-- PnL components breakdown (production-grade)
ALTER TABLE positions ADD COLUMN IF NOT EXISTS realized_pnl_usd DECIMAL(20, 8);
ALTER TABLE positions ADD COLUMN IF NOT EXISTS realized_pnl_percent DECIMAL(10, 4);
ALTER TABLE positions ADD COLUMN IF NOT EXISTS impermanent_loss_usd DECIMAL(20, 8);
ALTER TABLE positions ADD COLUMN IF NOT EXISTS impermanent_loss_percent DECIMAL(10, 4);
ALTER TABLE positions ADD COLUMN IF NOT EXISTS fees_earned_usd DECIMAL(20, 8);
ALTER TABLE positions ADD COLUMN IF NOT EXISTS rewards_earned_usd DECIMAL(20, 8) DEFAULT 0;

-- Add comments for documentation
COMMENT ON COLUMN positions.deposit_value_usd IS 'Total USD value at deposit time (for accurate PnL)';
COMMENT ON COLUMN positions.deposit_token_x_price IS 'Token X (zBTC) price at deposit time';
COMMENT ON COLUMN positions.deposit_token_y_price IS 'Token Y (SOL) price at deposit time';
COMMENT ON COLUMN positions.withdraw_value_usd IS 'Total USD value at withdrawal time';
COMMENT ON COLUMN positions.withdraw_token_x_price IS 'Token X price at withdrawal time';
COMMENT ON COLUMN positions.withdraw_token_y_price IS 'Token Y price at withdrawal time';
COMMENT ON COLUMN positions.realized_pnl_usd IS 'Final PnL in USD (currentValue + fees + rewards - depositValue)';
COMMENT ON COLUMN positions.realized_pnl_percent IS 'PnL as percentage of deposit value';
COMMENT ON COLUMN positions.impermanent_loss_usd IS 'IL in USD (HODL value - position value)';
COMMENT ON COLUMN positions.impermanent_loss_percent IS 'IL as percentage';
COMMENT ON COLUMN positions.fees_earned_usd IS 'Total fees earned in USD (claimed + unclaimed)';
COMMENT ON COLUMN positions.rewards_earned_usd IS 'Total rewards earned in USD';

-- ═══════════════════════════════════════════════════════════════════
-- STEP 2: Create position_transactions table for historical tracking
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS position_transactions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  position_id TEXT NOT NULL,
  transaction_type TEXT NOT NULL, -- 'deposit', 'withdraw', 'fee_claim', 'reward_claim'
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  block_height BIGINT,
  signature TEXT UNIQUE,

  -- Token amounts at transaction time
  token_x_amount DECIMAL(20, 8) DEFAULT 0,
  token_y_amount DECIMAL(20, 8) DEFAULT 0,

  -- Prices at transaction time (from Jupiter/Pyth)
  token_x_price DECIMAL(20, 8) NOT NULL,
  token_y_price DECIMAL(20, 8) NOT NULL,

  -- USD value at transaction time
  usd_value DECIMAL(20, 8) NOT NULL,

  -- Metadata
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),

  FOREIGN KEY (position_id) REFERENCES positions(position_id) ON DELETE CASCADE
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_position_transactions_position ON position_transactions(position_id, transaction_type, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_position_transactions_timestamp ON position_transactions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_position_transactions_signature ON position_transactions(signature) WHERE signature IS NOT NULL;

-- Comments
COMMENT ON TABLE position_transactions IS 'Historical transaction log for accurate PnL calculation';
COMMENT ON COLUMN position_transactions.transaction_type IS 'Type: deposit, withdraw, fee_claim, reward_claim';
COMMENT ON COLUMN position_transactions.token_x_price IS 'Token X price at this transaction time';
COMMENT ON COLUMN position_transactions.token_y_price IS 'Token Y price at this transaction time';
COMMENT ON COLUMN position_transactions.usd_value IS 'Total USD value of this transaction';

-- ═══════════════════════════════════════════════════════════════════
-- STEP 3: Migrate existing data (set deposit prices from entryPrice)
-- ═══════════════════════════════════════════════════════════════════

-- For existing positions, use entryPrice as deposit price
-- This is an approximation but better than NULL
UPDATE positions
SET
  deposit_token_x_price = entry_price,
  deposit_token_y_price = 0, -- Will be updated on next price fetch
  deposit_value_usd = (zbtc_amount * entry_price) + (sol_amount * 0) -- Approximate
WHERE deposit_token_x_price IS NULL;

-- For closed positions, use exitPrice as withdraw price
UPDATE positions
SET
  withdraw_token_x_price = exit_price,
  withdraw_token_y_price = 0, -- Will be updated on next price fetch
  withdraw_value_usd = (COALESCE(zbtc_returned, zbtc_amount) * COALESCE(exit_price, entry_price))
                       + (COALESCE(sol_returned, sol_amount) * 0)
WHERE is_active = FALSE AND withdraw_token_x_price IS NULL;

-- Migrate existing pnlUsd to realized_pnl_usd
UPDATE positions
SET
  realized_pnl_usd = pnl_usd,
  realized_pnl_percent = pnl_percent
WHERE pnl_usd IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- STEP 4: Update user_stats for IL tracking
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS total_impermanent_loss_usd DECIMAL(20, 8) DEFAULT 0;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS total_fees_earned_usd DECIMAL(20, 8) DEFAULT 0;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS total_rewards_earned_usd DECIMAL(20, 8) DEFAULT 0;

COMMENT ON COLUMN user_stats.total_impermanent_loss_usd IS 'Aggregate IL across all positions';
COMMENT ON COLUMN user_stats.total_fees_earned_usd IS 'Aggregate fees earned across all positions';
COMMENT ON COLUMN user_stats.total_rewards_earned_usd IS 'Aggregate rewards earned across all positions';

-- ═══════════════════════════════════════════════════════════════════
-- STEP 5: Create helper function for calculating PnL
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION calculate_position_pnl(position_row positions)
RETURNS TABLE (
  realized_pnl DECIMAL(20, 8),
  pnl_percent DECIMAL(10, 4),
  il_usd DECIMAL(20, 8),
  il_percent DECIMAL(10, 4)
) AS $$
DECLARE
  deposit_value DECIMAL(20, 8);
  current_value DECIMAL(20, 8);
  hodl_value DECIMAL(20, 8);
BEGIN
  -- Deposit value
  deposit_value := COALESCE(position_row.deposit_value_usd, 0);

  -- Current/Withdraw value
  IF position_row.is_active THEN
    -- For open positions, would need current prices (not calculated here)
    current_value := deposit_value; -- Placeholder
  ELSE
    current_value := COALESCE(position_row.withdraw_value_usd, 0);
  END IF;

  -- HODL value (what you'd have if you just held)
  IF position_row.is_active THEN
    hodl_value := deposit_value; -- Placeholder
  ELSE
    hodl_value := (position_row.zbtc_amount * COALESCE(position_row.withdraw_token_x_price, position_row.deposit_token_x_price))
                  + (position_row.sol_amount * COALESCE(position_row.withdraw_token_y_price, position_row.deposit_token_y_price));
  END IF;

  -- Calculate PnL
  realized_pnl := current_value + COALESCE(position_row.fees_earned_usd, 0) + COALESCE(position_row.rewards_earned_usd, 0) - deposit_value;
  pnl_percent := CASE WHEN deposit_value > 0 THEN (realized_pnl / deposit_value) * 100 ELSE 0 END;

  -- Calculate IL
  il_usd := hodl_value - current_value;
  il_percent := CASE WHEN deposit_value > 0 THEN (il_usd / deposit_value) * 100 ELSE 0 END;

  RETURN QUERY SELECT realized_pnl, pnl_percent, il_usd, il_percent;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_position_pnl IS 'Calculate PnL and IL for a position (production-grade formula)';

-- ═══════════════════════════════════════════════════════════════════
-- STEP 6: Add indexes for performance
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_positions_pnl_analysis ON positions(user_id, is_active, realized_pnl_usd) WHERE realized_pnl_usd IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_positions_deposit_time ON positions(created_at, is_active);

-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION COMPLETE
-- ═══════════════════════════════════════════════════════════════════
