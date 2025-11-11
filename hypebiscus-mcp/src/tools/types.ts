// Type definitions for Hypebiscus MCP Server

export interface PoolMetricsInput {
  poolAddress?: string;
  userId?: string;
  walletAddress?: string;
}

export interface TokenInfo {
  symbol: string;
  amount: number;
  decimals: number;
  usdValue: number;
}

export interface LiquidityInfo {
  totalUSD: number;
  tokenA: TokenInfo;
  tokenB: TokenInfo;
}

export interface MetricsInfo {
  apy: number;
  fees24h: number;
  volume24h: number;
  binStep: number;
  activeBin: number;
}

export interface PriceInfo {
  usd: number;
  change24h: number;
}

export interface PricesInfo {
  zBTC?: PriceInfo;
  sol?: PriceInfo;
  [key: string]: PriceInfo | undefined;
}

export interface PoolMetricsOutput {
  poolAddress: string;
  poolName: string;
  liquidity: LiquidityInfo;
  metrics: MetricsInfo;
  prices: PricesInfo;
  timestamp: string;
  recommendation?: string;
  userContext?: {
    positionsInPool: number;
    avgPerformance: number;
    personalizedRecommendation?: string;
  };
}

// Meteora API Response Types
export interface MeteoraPoolResponse {
  address: string;
  name: string;
  mint_x: string;
  mint_y: string;
  reserve_x: string;
  reserve_y: string;
  reserve_x_amount: number;
  reserve_y_amount: number;
  bin_step: number;
  base_fee_percentage: string;
  protocol_fee_percentage: string;
  liquidity: string;
  reward_mint_x: string;
  reward_mint_y: string;
  fees_24h: number;
  today_fees: number;
  trade_volume_24h: number;
  cumulative_trade_volume: string;
  cumulative_fee_volume: string;
  current_price: number;
  apr: number;
  apy: number;
  farm_apr: number;
  farm_apy: number;
  hide: boolean;
}

// Birdeye Price API Response Types
export interface BirdeyePriceData {
  value: number;
  updateUnixTime: number;
  updateHumanTime: string;
  priceChange24h: number;
}

export interface BirdeyePriceResponse {
  success: boolean;
  data: {
    [address: string]: BirdeyePriceData;
  };
}

// Jupiter Price API Response Types
export interface JupiterPriceResponse {
  data: {
    [symbol: string]: {
      id: string;
      mintSymbol: string;
      vsToken: string;
      vsTokenSymbol: string;
      price: number;
    };
  };
  timeTaken: number;
}

// Solana Account Info Types
export interface SolanaTokenAccount {
  mint: string;
  owner: string;
  amount: string;
  decimals: number;
}

// Error Types
export enum ErrorType {
  INVALID_POOL_ADDRESS = 'INVALID_POOL_ADDRESS',
  RPC_ERROR = 'RPC_ERROR',
  API_ERROR = 'API_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  CACHE_ERROR = 'CACHE_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export class HypebiscusMCPError extends Error {
  constructor(
    public type: ErrorType,
    message: string,
    public details?: string
  ) {
    super(message);
    this.name = 'HypebiscusMCPError';
  }
}

// Token mint addresses (Solana mainnet)
export const TOKEN_MINTS = {
  SOL: 'So11111111111111111111111111111111111111112',
  zBTC: 'zBTCug3er3tLyffELcvDNrKkCymbPWysGcWihESYfLg', // Actual zBTC from Meteora pool (tracked by Jupiter)
  wBTC: '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh',
  cbBTC: 'CBBTCbZu5MtBJVB3qhLbw6aFoPJKhRKSaJpU9jJ4K3M9',
} as const;

// Known token decimals
export const TOKEN_DECIMALS = {
  SOL: 9,
  zBTC: 8,
  wBTC: 8,
  cbBTC: 8,
} as const;
