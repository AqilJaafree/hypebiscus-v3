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
