/**
 * TypeScript interfaces for Hybrid Data Sync
 * Matches the response structure from get_user_positions_with_sync MCP tool
 */

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

export interface HybridPosition {
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
  exitDate?: string;
  entryBin?: number;
  exitBin?: number;

  // Fees
  fees: PositionFees;

  // Performance
  pnl?: PositionPnL;

  // Real-time data (if active)
  health?: PositionHealth;

  timestamp: string;
}

export interface HybridSyncResponse {
  positions: HybridPosition[];
  summary: {
    total: number;
    active: number;
    closed: number;
    merged: number;
  };
}
