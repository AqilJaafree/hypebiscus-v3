// Database types for MCP tools
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Tool input types
 */
export interface GetUserByWalletInput {
  walletAddress: string;
}

export interface GetUserPositionsInput {
  userId?: string;
  walletAddress?: string;
  includeInactive?: boolean;
}

export interface GetWalletPerformanceInput {
  walletAddress: string;
}

export interface GetPositionDetailsInput {
  positionId: string;
}

/**
 * Tool output types
 */
export interface UserInfo {
  id: string;
  telegramId: string;
  username: string | null;
  isMonitoring: boolean;
  createdAt: string;
  wallet: {
    publicKey: string;
    createdAt: string;
  };
  stats: {
    totalPositions: number;
    activePositions: number;
    totalZbtcFees: number;
    totalSolFees: number;
    totalPnlUsd: number;
    avgPositionSize: number;
    avgHoldTime: number;
    updatedAt: string;
  } | null;
}

export interface PositionInfo {
  id: string;
  positionId: string;
  poolAddress: string;
  zbtcAmount: number;
  solAmount: number;
  entryPrice: number;
  entryBin: number;
  isActive: boolean;
  createdAt: string;
  lastChecked: string;
  // Exit data
  zbtcReturned: number | null;
  solReturned: number | null;
  exitPrice: number | null;
  exitBin: number | null;
  closedAt: string | null;
  // Fees and PnL
  zbtcFees: number | null;
  solFees: number | null;
  pnlUsd: number | null;
  pnlPercent: number | null;
}

export interface PositionWithPool extends PositionInfo {
  poolMetrics?: {
    poolName: string;
    currentPrice: number;
    apy: number;
    volume24h: number;
    fees24h: number;
  };
}

export interface WalletPerformance {
  walletAddress: string;
  user: {
    id: string;
    username: string | null;
  };
  summary: {
    totalPositions: number;
    activePositions: number;
    closedPositions: number;
    totalPnlUsd: number;
    totalZbtcFees: number;
    totalSolFees: number;
    avgPositionSize: number;
    avgHoldTime: number;
  };
  performance: {
    bestPosition: {
      pnlUsd: number;
      pnlPercent: number;
    } | null;
    worstPosition: {
      pnlUsd: number;
      pnlPercent: number;
    } | null;
    winRate: number;
    avgPnlPercent: number;
  };
  activePositions: PositionInfo[];
}

export interface PositionDetails extends PositionInfo {
  user: {
    id: string;
    username: string | null;
    walletAddress: string;
  };
  poolMetrics: {
    poolName: string;
    currentPrice: number;
    apy: number;
    volume24h: number;
    fees24h: number;
    liquidity: number;
  };
  performance: {
    holdingPeriodDays: number;
    unrealizedPnl?: {
      zbtc: number;
      sol: number;
      usd: number;
      percent: number;
    };
    realizedPnl?: {
      zbtc: number;
      sol: number;
      usd: number;
      percent: number;
    };
  };
}

/**
 * Helper function to convert Prisma Decimal to number safely
 * @param value - Decimal or null
 * @returns number or null
 */
export function decimalToNumber(value: Decimal | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return value.toNumber();
}

/**
 * Database error types
 */
export enum DatabaseErrorType {
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  POSITION_NOT_FOUND = 'POSITION_NOT_FOUND',
  WALLET_NOT_FOUND = 'WALLET_NOT_FOUND',
  DATABASE_CONNECTION_ERROR = 'DATABASE_CONNECTION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  INVALID_STATE = 'INVALID_STATE',
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
}

export class DatabaseError extends Error {
  constructor(
    public type: DatabaseErrorType,
    message: string,
    public details?: string
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}
