// Types for production-grade PnL calculations

export interface TokenValue {
  amount: number;
  price: number;
  usdValue: number;
}

export interface PositionSnapshot {
  tokenX: TokenValue;
  tokenY: TokenValue;
  timestamp: string;
}

export interface FeesBreakdown {
  tokenX: {
    amount: number;
    claimedUsd: number;
    unclaimedUsd: number;
  };
  tokenY: {
    amount: number;
    claimedUsd: number;
    unclaimedUsd: number;
  };
}

export interface RewardInfo {
  token: string;
  amount: number;
  usdValue: number;
  claimed: boolean;
}

export interface ImpermanentLoss {
  usd: number;
  percent: number;
}

export interface PositionPnLResult {
  positionId: string;
  status: 'open' | 'closed';

  // Core values
  depositValueUsd: number;
  currentValueUsd: number;

  // PnL breakdown
  realizedPnlUsd: number;
  realizedPnlPercent: number;

  // Components
  impermanentLoss: ImpermanentLoss;
  feesEarnedUsd: number;
  rewardsEarnedUsd: number;

  // Detailed breakdown
  deposit: PositionSnapshot;
  current: PositionSnapshot;
  fees: FeesBreakdown;
  rewards: RewardInfo[];
}

export interface WalletPnLResult {
  walletAddress: string;

  // Summary
  totalPnlUsd: number;
  totalPositions: number;
  activePositions: number;
  closedPositions: number;

  // Aggregates
  totalImpermanentLossUsd: number;
  totalFeesEarnedUsd: number;
  totalRewardsEarnedUsd: number;

  // Positions list
  positions: PositionPnLResult[];
}

export interface ClosePositionResult {
  success: boolean;
  positionId: string;
  signature?: string;
  pnl: PositionPnLResult;
}

export interface TransactionRecord {
  positionId: string;
  type: 'deposit' | 'withdraw' | 'fee_claim' | 'reward_claim';
  timestamp: Date;
  signature?: string;
  tokenXAmount: number;
  tokenYAmount: number;
  tokenXPrice: number;
  tokenYPrice: number;
  usdValue: number;
  notes?: string;
}
