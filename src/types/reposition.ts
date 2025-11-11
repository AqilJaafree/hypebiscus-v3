/**
 * Frontend types for position repositioning
 * Matches MCP server reposition types
 */

export type RepositionStrategy = 'one-sided-x' | 'one-sided-y' | 'balanced';
export type RepositionUrgency = 'low' | 'medium' | 'high';
export type RepositionReason = 'out_of_range' | 'manual' | 'scheduled';

export interface RepositionRecommendation {
  positionId: string;
  shouldReposition: boolean;
  reason: string;
  currentActiveBin: number;
  positionRange: { min: number; max: number };
  distanceFromRange: number;
  urgency: RepositionUrgency;
  estimatedGasCost: number;
  recommendedStrategy: RepositionStrategy;
  recommendedBinRange: {
    min: number;
    max: number;
  };
}

export interface LiquidityRecovered {
  tokenX: number;
  tokenY: number;
  feesX: number;
  feesY: number;
  totalUSD: number;
}

export interface UnsignedRepositionTransaction {
  transaction: string; // base64 encoded
  metadata: {
    oldPosition: string;
    poolAddress: string;
    estimatedLiquidityRecovered: LiquidityRecovered;
    newBinRange: {
      min: number;
      max: number;
    };
    strategy: RepositionStrategy;
  };
}

export interface PositionChainEntry {
  id: string;
  oldPositionAddress: string;
  newPositionAddress: string;
  repositionReason: RepositionReason;
  oldBinRange: string;
  newBinRange: string;
  activeBinAtReposition: number;
  distanceFromRange: number;
  liquidityRecovered: {
    tokenX: number;
    tokenY: number;
  };
  feesCollected: {
    tokenX: number;
    tokenY: number;
  };
  transactionSignature: string | null;
  gasCostSol: number | null;
  createdAt: string;
}

export interface PositionChain {
  currentPosition: string;
  chainLength: number;
  totalRepositions: number;
  history: PositionChainEntry[];
  totalFeesCollected: {
    tokenX: number;
    tokenY: number;
    totalUSD: number;
  };
  totalGasCost: number;
}

export interface WalletRepositionStats {
  totalRepositions: number;
  totalFeesCollected: {
    tokenX: number;
    tokenY: number;
    totalUSD: number;
  };
  totalGasCost: number;
  netProfit: number;
  mostUsedStrategy: {
    strategy: RepositionStrategy;
    count: number;
  };
  averageTimeBetweenRepositions: number; // in days
  successRate: number;
}

export interface PrepareRepositionParams {
  positionAddress: string;
  walletAddress: string;
  poolAddress?: string;
  strategy?: RepositionStrategy;
  binRange?: number;
  slippage?: number;
}
