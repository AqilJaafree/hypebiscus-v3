// Hybrid Data Sync Types
// Types for merging database (historical) and blockchain (real-time) data

export interface SyncPositionInput {
  walletAddress: string;
  includeHistorical?: boolean; // Include closed positions from DB
  includeLive?: boolean; // Include active positions from blockchain
  positionId?: string; // Optional: Filter to specific position
}

export interface TokenAmount {
  symbol: string;
  amount: number;
  usdValue: number;
}

export interface PositionFees {
  tokenX: number;
  tokenY: number;
  totalUSD: number;
  claimed: {
    tokenX: number;
    tokenY: number;
    totalUSD: number;
  };
}

export interface PositionPnL {
  usd: number;
  percent: number;
}

export interface PositionHealth {
  isInRange: boolean;
  status: 'healthy' | 'at-edge' | 'out-of-range';
  distanceFromActiveBin: number;
}

export interface SyncPosition {
  positionId: string;
  poolAddress: string;
  status: 'active' | 'closed';
  source: 'blockchain' | 'database' | 'both';

  // Token amounts
  tokenX: TokenAmount;
  tokenY: TokenAmount;
  totalLiquidityUSD: number;

  // Position metadata
  entryDate: string;
  exitDate: string | null;
  entryBin: number | null;
  exitBin: number | null;

  // Fees
  fees: PositionFees;

  // Performance
  pnl: PositionPnL | null;

  // Real-time data (if active)
  health: PositionHealth | null;

  timestamp: string;
}

export interface PriceData {
  zbtcPrice: number;
  solPrice: number;
  timestamp: string;
}

export interface SyncSummary {
  totalPositions: number;
  activePositions: number;
  closedPositions: number;
  databasePositions: number;
  blockchainPositions: number;
  mergedPositions: number;
}
