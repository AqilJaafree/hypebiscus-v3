// Tool: calculate_position_pnl - Calculate PnL for a single position (production-grade)
import { Connection } from '@solana/web3.js';
import { logger, config } from '../config.js';
import { validateSolanaAddress } from '../utils/validation.js';
import { withErrorHandling, formatError } from '../utils/errors.js';
import { withCache } from '../utils/cache.js';
import { calculatePositionPnL } from '../services/pnlCalculator.js';
import type { PositionPnLResult } from '../types/pnl.js';
import { DatabaseError, DatabaseErrorType } from '../types/database.js';

export interface CalculatePositionPnLInput {
  positionId: string;
}

/**
 * Calculate PnL for a position using production-grade formula
 *
 * Formula:
 * - For OPEN positions: Unrealized PnL = (Current value + Unclaimed fees + Unclaimed rewards) - Deposit value
 * - For CLOSED positions: Realized PnL = (Withdrawn value + Claimed fees + Claimed rewards) - Deposit value
 *
 * Also calculates:
 * - Impermanent Loss (IL)
 * - Fee earnings breakdown
 * - Rewards earnings
 *
 * @param input - Position ID
 * @returns Detailed PnL breakdown
 */
export async function calculatePositionPnL_tool(
  input: CalculatePositionPnLInput
): Promise<PositionPnLResult> {
  return withErrorHandling(async () => {
    const { positionId } = input;

    // Validate position ID (should be a valid Solana address)
    try {
      validateSolanaAddress(positionId);
    } catch (error) {
      throw new DatabaseError(
        DatabaseErrorType.INVALID_INPUT,
        `Invalid position ID: ${positionId}`,
        'Position ID must be a valid Solana public key'
      );
    }

    logger.info(`[MCP Tool] Calculating PnL for position: ${positionId}`);

    // Create cache key (cache for 30 seconds for active positions)
    const cacheKey = `pnl:position:${positionId}`;

    const pnlResult = await withCache(
      cacheKey,
      async () => {
        const connection = new Connection(config.solanaRpcUrl, {
          commitment: 'confirmed',
          confirmTransactionInitialTimeout: config.requestTimeout,
        });

        return await calculatePositionPnL(positionId, connection);
      },
      30 // Cache for 30 seconds
    );

    logger.info(
      `[MCP Tool] PnL calculated: ${pnlResult.status} position, ` +
        `PnL: $${pnlResult.realizedPnlUsd.toFixed(2)} (${pnlResult.realizedPnlPercent.toFixed(2)}%), ` +
        `IL: $${pnlResult.impermanentLoss.usd.toFixed(2)}, ` +
        `Fees: $${pnlResult.feesEarnedUsd.toFixed(2)}`
    );

    return pnlResult;
  }, 'calculate position PnL');
}

/**
 * Format PnL result as human-readable string
 */
export function formatPositionPnL(pnl: PositionPnLResult): string {
  const lines: string[] = [];

  lines.push(`Position PnL Report: ${pnl.positionId.slice(0, 8)}...${pnl.positionId.slice(-6)}`);
  lines.push('═'.repeat(80));
  lines.push('');

  // Status
  lines.push(`Status: ${pnl.status.toUpperCase()}`);
  lines.push('');

  // Deposit Info
  lines.push('DEPOSIT:');
  lines.push(`  ${pnl.deposit.tokenX.amount.toFixed(8)} zBTC @ $${pnl.deposit.tokenX.price.toFixed(2)}`);
  lines.push(`  ${pnl.deposit.tokenY.amount.toFixed(4)} SOL @ $${pnl.deposit.tokenY.price.toFixed(2)}`);
  lines.push(`  Total Value: $${pnl.depositValueUsd.toFixed(2)}`);
  lines.push(`  Date: ${new Date(pnl.deposit.timestamp).toLocaleString()}`);
  lines.push('');

  // Current/Withdrawal Info
  const label = pnl.status === 'open' ? 'CURRENT' : 'WITHDRAWN';
  lines.push(`${label}:`);
  lines.push(`  ${pnl.current.tokenX.amount.toFixed(8)} zBTC @ $${pnl.current.tokenX.price.toFixed(2)}`);
  lines.push(`  ${pnl.current.tokenY.amount.toFixed(4)} SOL @ $${pnl.current.tokenY.price.toFixed(2)}`);
  lines.push(`  Total Value: $${pnl.currentValueUsd.toFixed(2)}`);
  lines.push(`  Date: ${new Date(pnl.current.timestamp).toLocaleString()}`);
  lines.push('');

  // Fees
  lines.push('FEES EARNED:');
  const totalFeesZbtc = pnl.fees.tokenX.amount;
  const totalFeesSol = pnl.fees.tokenY.amount;
  lines.push(`  ${totalFeesZbtc.toFixed(8)} zBTC ($${(pnl.fees.tokenX.claimedUsd + pnl.fees.tokenX.unclaimedUsd).toFixed(2)})`);
  lines.push(`  ${totalFeesSol.toFixed(4)} SOL ($${(pnl.fees.tokenY.claimedUsd + pnl.fees.tokenY.unclaimedUsd).toFixed(2)})`);
  lines.push(`  Total: $${pnl.feesEarnedUsd.toFixed(2)}`);
  if (pnl.status === 'open') {
    lines.push(`    Unclaimed: $${(pnl.fees.tokenX.unclaimedUsd + pnl.fees.tokenY.unclaimedUsd).toFixed(2)}`);
  }
  lines.push('');

  // Rewards
  if (pnl.rewardsEarnedUsd > 0) {
    lines.push('REWARDS EARNED:');
    lines.push(`  Total: $${pnl.rewardsEarnedUsd.toFixed(2)}`);
    lines.push('');
  }

  // Impermanent Loss
  lines.push('IMPERMANENT LOSS:');
  const ilSign = pnl.impermanentLoss.usd >= 0 ? '+' : '';
  lines.push(`  ${ilSign}$${pnl.impermanentLoss.usd.toFixed(2)} (${ilSign}${pnl.impermanentLoss.percent.toFixed(2)}%)`);
  if (pnl.impermanentLoss.usd > 0) {
    lines.push(`  ⚠️  You lost $${pnl.impermanentLoss.usd.toFixed(2)} due to IL vs holding`);
  } else if (pnl.impermanentLoss.usd < 0) {
    lines.push(`  ✅ You gained $${Math.abs(pnl.impermanentLoss.usd).toFixed(2)} vs holding (negative IL)`);
  }
  lines.push('');

  // Final PnL
  lines.push('═'.repeat(80));
  lines.push('FINAL PnL:');
  const pnlSign = pnl.realizedPnlUsd >= 0 ? '+' : '';
  const pnlEmoji = pnl.realizedPnlUsd >= 0 ? '📈' : '📉';
  lines.push(
    `  ${pnlEmoji} ${pnlSign}$${pnl.realizedPnlUsd.toFixed(2)} (${pnlSign}${pnl.realizedPnlPercent.toFixed(2)}%)`
  );
  lines.push('');

  // Breakdown
  lines.push('Breakdown:');
  const valueDiff = pnl.currentValueUsd - pnl.depositValueUsd;
  lines.push(`  Position Value Change: ${valueDiff >= 0 ? '+' : ''}$${valueDiff.toFixed(2)}`);
  lines.push(`  + Fees Earned: $${pnl.feesEarnedUsd.toFixed(2)}`);
  if (pnl.rewardsEarnedUsd > 0) {
    lines.push(`  + Rewards Earned: $${pnl.rewardsEarnedUsd.toFixed(2)}`);
  }
  lines.push(`  = Total PnL: ${pnlSign}$${pnl.realizedPnlUsd.toFixed(2)}`);
  lines.push('');

  lines.push('═'.repeat(80));

  return lines.join('\n');
}

/**
 * Format error for tool response
 */
export function formatCalculatePnLError(error: unknown): string {
  return `Failed to calculate position PnL.\n\n${formatError(error)}\n\nPlease check the position ID and try again.`;
}
