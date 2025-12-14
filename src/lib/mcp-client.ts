/**
 * MCP Client SDK
 *
 * Frontend client for communicating with the MCP server via Next.js API route
 * Provides type-safe access to all MCP tools
 */

export interface MCPClientConfig {
  apiUrl?: string;
  timeout?: number;
}

export interface PoolMetricsParams extends Record<string, unknown> {
  poolAddress?: string;
  userId?: string;
  walletAddress?: string;
}

export interface UserByWalletParams extends Record<string, unknown> {
  walletAddress: string;
}

export interface UserPositionsParams extends Record<string, unknown> {
  userId?: string;
  walletAddress?: string;
  includeInactive?: boolean;
}

export interface WalletPerformanceParams extends Record<string, unknown> {
  walletAddress: string;
}

export interface PositionDetailsParams extends Record<string, unknown> {
  positionId: string;
}

export interface DlmmPositionParams extends Record<string, unknown> {
  positionId: string;
  poolAddress?: string;
  includePriceData?: boolean;
}

export interface BinDistributionParams extends Record<string, unknown> {
  poolAddress?: string;
  rangeSize?: number;
  includeEmptyBins?: boolean;
}

export interface CalculateRebalanceParams extends Record<string, unknown> {
  positionId: string;
  poolAddress?: string;
  bufferBins?: number;
}

export interface UserPositionsWithSyncParams extends Record<string, unknown> {
  walletAddress: string;
  includeHistorical?: boolean;
  includeLive?: boolean;
}

export interface CalculatePositionPnLParams extends Record<string, unknown> {
  positionId: string;
}

export interface ClosePositionParams extends Record<string, unknown> {
  positionId: string;
  walletAddress: string;
  closeOnBlockchain?: boolean;
  transactionSignature?: string;
}

export interface GetWalletPnLParams extends Record<string, unknown> {
  walletAddress: string;
}

export interface PositionPnLResult {
  positionId: string;
  realizedPnlUsd: number;
  realizedPnlPercent: number;
  depositValueUsd: number;
  currentValueUsd: number;
  feesEarnedUsd: number;
  rewardsEarnedUsd: number;
  impermanentLoss: {
    usd: number;
    percent: number;
  };
  status: string;
}

export interface ClosePositionResult {
  success: boolean;
  positionId: string;
  signature?: string;
  pnl: PositionPnLResult;
}

export interface WalletPnLResult {
  walletAddress: string;
  totalPnlUsd: number;
  totalPnlPercent: number;
  totalFeesEarnedUsd: number;
  totalRewardsEarnedUsd: number;
  totalImpermanentLossUsd: number;
  activePositionsCount: number;
  closedPositionsCount: number;
  positions: PositionPnLResult[];
}

export interface SubscriptionCheckParams extends Record<string, unknown> {
  walletAddress: string;
}

export interface SubscriptionCheckResult {
  isActive: boolean;
  tier?: string;
  status?: string;
  expiresAt?: string;
  daysRemaining?: number;
  message: string;
}

export interface CreditBalanceParams extends Record<string, unknown> {
  walletAddress: string;
}

export interface CreditBalanceResult {
  balance: number;
  totalPurchased: number;
  totalUsed: number;
  message: string;
}

export type UserTier = 'free' | 'credits' | 'premium';

export interface UserTierInfo {
  tier: UserTier;
  hasActiveSubscription: boolean;
  subscriptionDaysRemaining?: number;
  creditBalance: number;
  canAccessFullPnL: boolean;
  canAccessAdvancedFeatures: boolean;
}

export interface DeleteWalletCompletelyParams extends Record<string, unknown> {
  walletAddress?: string;
  telegramId?: string;
}

export interface DeleteWalletCompletelyResult {
  success: boolean;
  walletAddress: string;
  deletedRecords: {
    userLink: boolean;
    positionLinks: number;
    credits: number;
    subscriptions: number;
    creditTransactions: number;
    linkTokens: number;
    repositionExecutions: number;
    pendingTransactions: number;
    botGeneratedWallet: boolean;
  };
  message: string;
}

export class MCPClient {
  private apiUrl: string;
  private timeout: number;

  constructor(config: MCPClientConfig = {}) {
    this.apiUrl = config.apiUrl || '/api/mcp';
    this.timeout = config.timeout || 30000;
  }

  /**
   * Make a call to MCP server via Next.js API route
   */
  private async call<T = unknown>(
    method: string,
    params: Record<string, unknown>
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: method,
            arguments: params,
          },
          id: Date.now(),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      const data = await response.json() as {
        result?: {
          content?: Array<{ type: string; text: string }>;
          isError?: boolean;
        };
        error?: { message: string };
      };

      // Check for MCP protocol error
      if (data.error) {
        throw new Error(data.error.message);
      }

      // Check for tool execution error
      if (data.result?.isError) {
        const errorText = data.result.content?.[0]?.text || 'Unknown error';
        throw new Error(errorText);
      }

      // Extract result text
      const resultText = data.result?.content?.[0]?.text;
      if (!resultText) {
        throw new Error('Empty response from MCP server');
      }

      // Try to parse as JSON
      try {
        return JSON.parse(resultText) as T;
      } catch {
        // Return as-is if not JSON
        return resultText as T;
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('Request timeout');
        }
        throw error;
      }
      throw new Error('Unknown error');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Get pool metrics with optional user context
   */
  async getPoolMetrics(params: PoolMetricsParams = {}): Promise<unknown> {
    return this.call('get_pool_metrics', params);
  }

  /**
   * Get user information by wallet address
   */
  async getUserByWallet(params: UserByWalletParams): Promise<unknown> {
    return this.call('get_user_by_wallet', params);
  }

  /**
   * Get user positions (active and optionally inactive) from database only
   */
  async getUserPositions(params: UserPositionsParams): Promise<unknown> {
    return this.call('get_user_positions', params);
  }

  /**
   * Get user positions with hybrid data sync (database + blockchain)
   * Merges historical database records with real-time blockchain data
   */
  async getUserPositionsWithSync(params: UserPositionsWithSyncParams): Promise<unknown> {
    return this.call('get_user_positions_with_sync', params);
  }

  /**
   * Get wallet performance metrics
   */
  async getWalletPerformance(params: WalletPerformanceParams): Promise<unknown> {
    return this.call('get_wallet_performance', params);
  }

  /**
   * Get detailed position information
   */
  async getPositionDetails(params: PositionDetailsParams): Promise<unknown> {
    return this.call('get_position_details', params);
  }

  /**
   * Get real-time DLMM position data from chain
   */
  async getDlmmPosition(params: DlmmPositionParams): Promise<unknown> {
    return this.call('get_dlmm_position', params);
  }

  /**
   * Get bin liquidity distribution around active price
   */
  async getBinDistribution(params: BinDistributionParams = {}): Promise<unknown> {
    return this.call('get_bin_distribution', params);
  }

  /**
   * Calculate if position needs rebalancing
   */
  async calculateRebalance(params: CalculateRebalanceParams): Promise<unknown> {
    return this.call('calculate_rebalance', params);
  }

  /**
   * Calculate PnL for a specific position
   * Returns detailed PnL breakdown including realized PnL, fees, rewards, and impermanent loss
   */
  async calculatePositionPnL(params: CalculatePositionPnLParams): Promise<PositionPnLResult> {
    return this.call<PositionPnLResult>('calculate_position_pnl', params);
  }

  /**
   * Close a position and calculate final PnL
   * Set closeOnBlockchain=false if already closed on blockchain (like Garden Bot does)
   * This will only calculate PnL and update database
   */
  async closePosition(params: ClosePositionParams): Promise<ClosePositionResult> {
    return this.call<ClosePositionResult>('close_position', params);
  }

  /**
   * Get wallet-level PnL summary across all positions
   * Returns aggregated PnL, fees, rewards, and IL for the entire wallet
   */
  async getWalletPnL(params: GetWalletPnLParams): Promise<WalletPnLResult> {
    return this.call<WalletPnLResult>('get_wallet_pnl', params);
  }

  /**
   * Check if wallet has active subscription
   */
  async checkSubscription(params: SubscriptionCheckParams): Promise<SubscriptionCheckResult> {
    return this.call<SubscriptionCheckResult>('check_subscription', params);
  }

  /**
   * Get credit balance for wallet
   */
  async getCreditBalance(params: CreditBalanceParams): Promise<CreditBalanceResult> {
    return this.call<CreditBalanceResult>('get_credit_balance', params);
  }

  /**
   * Get user tier information (subscription + credits)
   * Determines what features user can access
   */
  async getUserTier(walletAddress: string): Promise<UserTierInfo> {
    try {
      const [subscription, credits] = await Promise.all([
        this.checkSubscription({ walletAddress }),
        this.getCreditBalance({ walletAddress }),
      ]);

      // Determine tier
      let tier: UserTier = 'free';
      let canAccessFullPnL = false;
      let canAccessAdvancedFeatures = false;

      if (subscription.isActive) {
        tier = 'premium';
        canAccessFullPnL = true;
        canAccessAdvancedFeatures = true;
      } else if (credits.balance > 0) {
        tier = 'credits';
        canAccessFullPnL = true;
        canAccessAdvancedFeatures = false; // Credits don't unlock advanced features
      }

      return {
        tier,
        hasActiveSubscription: subscription.isActive,
        subscriptionDaysRemaining: subscription.daysRemaining,
        creditBalance: credits.balance,
        canAccessFullPnL,
        canAccessAdvancedFeatures,
      };
    } catch (error) {
      // If check fails, assume free tier
      console.warn('Failed to check user tier:', error);
      return {
        tier: 'free',
        hasActiveSubscription: false,
        creditBalance: 0,
        canAccessFullPnL: false,
        canAccessAdvancedFeatures: false,
      };
    }
  }

  /**
   * Completely delete a wallet and all associated data
   * WARNING: This is a DESTRUCTIVE operation that cannot be undone
   */
  async deleteWalletCompletely(params: DeleteWalletCompletelyParams): Promise<DeleteWalletCompletelyResult> {
    return this.call<DeleteWalletCompletelyResult>('delete_wallet_completely', params);
  }

  /**
   * Check MCP server health
   */
  async healthCheck(): Promise<{ status: string; ready: boolean }> {
    const response = await fetch(this.apiUrl, { method: 'GET' });
    return response.json();
  }
}

/**
 * Default client instance
 */
export const mcpClient = new MCPClient();
