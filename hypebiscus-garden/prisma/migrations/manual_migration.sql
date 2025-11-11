-- Add new columns with default values first
ALTER TABLE positions ADD COLUMN IF NOT EXISTS "entryBin" INTEGER DEFAULT 0;
ALTER TABLE positions ADD COLUMN IF NOT EXISTS "solAmount" DECIMAL(20,8) DEFAULT 0;
ALTER TABLE positions ADD COLUMN IF NOT EXISTS "zbtcAmount" DECIMAL(20,8) DEFAULT 0;

-- Copy existing amount to zbtcAmount
UPDATE positions SET "zbtcAmount" = amount WHERE "zbtcAmount" = 0;

-- Add other optional columns
ALTER TABLE positions ADD COLUMN IF NOT EXISTS "zbtcReturned" DECIMAL(20,8);
ALTER TABLE positions ADD COLUMN IF NOT EXISTS "solReturned" DECIMAL(20,8);
ALTER TABLE positions ADD COLUMN IF NOT EXISTS "exitPrice" DECIMAL(20,8);
ALTER TABLE positions ADD COLUMN IF NOT EXISTS "exitBin" INTEGER;
ALTER TABLE positions ADD COLUMN IF NOT EXISTS "zbtcFees" DECIMAL(20,8) DEFAULT 0;
ALTER TABLE positions ADD COLUMN IF NOT EXISTS "solFees" DECIMAL(20,8) DEFAULT 0;
ALTER TABLE positions ADD COLUMN IF NOT EXISTS "pnlUsd" DECIMAL(20,8);
ALTER TABLE positions ADD COLUMN IF NOT EXISTS "pnlPercent" DECIMAL(10,4);
ALTER TABLE positions ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP;

-- Now make required columns NOT NULL
ALTER TABLE positions ALTER COLUMN "entryBin" SET NOT NULL;
ALTER TABLE positions ALTER COLUMN "solAmount" SET NOT NULL;
ALTER TABLE positions ALTER COLUMN "zbtcAmount" SET NOT NULL;

-- Create user_stats table if not exists
CREATE TABLE IF NOT EXISTS user_stats (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "userId" TEXT UNIQUE NOT NULL,
    "totalPositions" INTEGER DEFAULT 0,
    "activePositions" INTEGER DEFAULT 0,
    "totalZbtcFees" DECIMAL(20,8) DEFAULT 0,
    "totalSolFees" DECIMAL(20,8) DEFAULT 0,
    "totalPnlUsd" DECIMAL(20,8) DEFAULT 0,
    "avgPositionSize" DECIMAL(20,8) DEFAULT 0,
    "avgHoldTime" INTEGER DEFAULT 0,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE
);

-- Optional: Drop old amount column (AFTER verifying zbtcAmount has data)
-- ALTER TABLE positions DROP COLUMN IF EXISTS amount;