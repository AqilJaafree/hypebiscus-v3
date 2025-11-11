// Position Reposition Types
// Types for auto-repositioning out-of-range DLMM positions

export type RepositionStrategy = 'one-sided-x' | 'one-sided-y' | 'balanced';
export type RepositionReason = 'out_of_range' | 'manual' | 'scheduled';

export interface RepositionInput {
  positionAddress: string;
  walletAddress: string;
  poolAddress?: string;
  strategy?: RepositionStrategy;
  binRange?: number; // Number of bins to spread liquidity
  slippage?: number; // Slippage tolerance in bps (100 = 1%)
  walletSignature?: string; // Signature proving wallet ownership (required for security)
  timestamp?: number; // Timestamp for signature freshness validation
  maxGasCost?: number; // Maximum gas cost user is willing to pay (in SOL)
}

export interface RepositionParams {
  oldPositionAddress: string;
  newPositionAddress: string;
  walletAddress: string;
  poolAddress: string;
  repositionReason: RepositionReason;
  oldBinRange: string;
  newBinRange: string;
  activeBinAtReposition: number;
  distanceFromRange: number;
  transactionSignature?: string;
  gasCostSol?: number;
  oldTokenXAmount?: number;
  oldTokenYAmount?: number;
  feesClaimedX?: number;
  feesClaimedY?: number;
  newTokenXAmount?: number;
  newTokenYAmount?: number;
  strategy?: RepositionStrategy;
}

export interface LiquidityRecovered {
  tokenX: number;
  tokenY: number;
  feesX: number;
  feesY: number;
  totalUSD: number;
}

export interface NewPositionParams {
  binRange: {
    min: number;
    max: number;
  };
  tokenXAmount: number;
  tokenYAmount: number;
  strategy: RepositionStrategy;
}

export interface RepositionResult {
  success: boolean;
  oldPosition: string;
  newPosition: string;
  transactionSignature?: string;
  liquidityRecovered: LiquidityRecovered;
  newBinRange: {
    min: number;
    max: number;
  };
  gasCost?: number;
  error?: string;
}

export interface UnsignedRepositionTransaction {
  // Serialized transaction for client to sign
  transaction: string;
  // Transaction hash for integrity verification
  txHash?: string;
  // Metadata for display
  metadata: {
    oldPosition: string;
    poolAddress: string;
    estimatedLiquidityRecovered: LiquidityRecovered;
    newBinRange: {
      min: number;
      max: number;
    };
    strategy: RepositionStrategy;
    estimatedGasCost?: number;
    slippageProtection?: {
      maxPrice: number;
      minPrice: number;
      minOutputX: number;
      minOutputY: number;
    };
    expiresAt?: Date;
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
  createdAt: Date;
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

export interface RepositionRecommendation {
  positionId: string;
  shouldReposition: boolean;
  reason: string;
  currentActiveBin: number;
  positionRange: { min: number; max: number };
  distanceFromRange: number;
  urgency: 'low' | 'medium' | 'high';
  estimatedGasCost: number;
  recommendedStrategy: RepositionStrategy;
  recommendedBinRange: {
    min: number;
    max: number;
  };
}
