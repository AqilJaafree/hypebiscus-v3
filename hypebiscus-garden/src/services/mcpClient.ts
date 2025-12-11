// MCP Client for Garden Bot to call MCP server tools
import axios from 'axios';

export interface PositionPnLResult {
  positionId: string;
  status: 'open' | 'closed';
  depositValueUsd: number;
  currentValueUsd: number;
  realizedPnlUsd: number;
  realizedPnlPercent: number;
  impermanentLoss: {
    usd: number;
    percent: number;
  };
  feesEarnedUsd: number;
  rewardsEarnedUsd: number;
  deposit: {
    tokenX: { amount: number; price: number; usdValue: number };
    tokenY: { amount: number; price: number; usdValue: number };
  };
  current: {
    tokenX: { amount: number; price: number; usdValue: number };
    tokenY: { amount: number; price: number; usdValue: number };
  };
  fees: {
    tokenX: { amount: number; claimedUsd: number; unclaimedUsd: number };
    tokenY: { amount: number; claimedUsd: number; unclaimedUsd: number };
    totalFeesUsd: number;
  };
}

export interface ClosePositionResult {
  success: boolean;
  positionId: string;
  signature?: string;
  pnl: PositionPnLResult;
}

export class MCPClient {
  private baseURL: string;
  private timeout: number;

  constructor(baseURL?: string, timeout: number = 30000) {
    this.baseURL = baseURL || process.env.MCP_SERVER_URL || 'http://localhost:3001';
    this.timeout = timeout;
    console.log('MCP Client initialized:', this.baseURL);
  }

  private async callTool<T>(toolName: string, args: any): Promise<T> {
    try {
      // MCP HTTP server expects: POST / with {"method": "tool_name", "params": {...}}
      const response = await axios.post(
        this.baseURL,
        {
          method: toolName,
          params: args,
        },
        {
          timeout: this.timeout,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      // MCP returns JSON-RPC format: {"jsonrpc": "2.0", "id": "...", "result": {...}}
      if (response.data.error) {
        throw new Error(response.data.error.message || 'MCP tool error');
      }

      if (response.data.result) {
        // Check for MCP error response (isError flag)
        if (response.data.result.isError) {
          const errorText = response.data.result.content?.[0]?.text || 'Unknown MCP error';
          throw new Error(errorText);
        }

        // Result contains MCP format: {content: [{type: "text", text: "..."}]}
        if (response.data.result.content && response.data.result.content[0]?.text) {
          try {
            return JSON.parse(response.data.result.content[0].text);
          } catch {
            // If not JSON, return the result as-is
            return response.data.result as T;
          }
        }
        return response.data.result as T;
      }

      throw new Error('No result in MCP response');
    } catch (error: any) {
      console.error('MCP Client error calling', toolName, ':', error.message);
      throw new Error('MCP call failed: ' + error.message);
    }
  }

  async calculatePositionPnL(positionId: string): Promise<PositionPnLResult> {
    console.log('Calculating PnL for position:', positionId.substring(0, 8) + '...');
    return this.callTool<PositionPnLResult>('calculate_position_pnl', {
      positionId,
    });
  }

  /**
   * Calculate PnL for a position that was already closed on blockchain
   *
   * IMPORTANT: This does NOT close the position on blockchain!
   * The name "closePosition" refers to the MCP tool name, but we call it
   * with closeOnBlockchain=false, which means:
   *
   * What MCP does:
   * 1. Fetch current token prices from Jupiter/Birdeye
   * 2. Fetch deposit prices from database (recorded at creation)
   * 3. Calculate production-grade PnL:
   *    - Realized PnL = (Current Value + Fees + Rewards) - Deposit Value
   *    - Impermanent Loss = HODL Value - Position Value
   * 4. Update database with final PnL values
   * 5. Return structured PnL data
   *
   * What MCP does NOT do:
   * - Does NOT touch blockchain
   * - Does NOT remove liquidity
   * - Does NOT transfer tokens
   *
   * The actual blockchain closing happens in Garden Bot's dlmmService.closePosition()
   * before this function is called.
   *
   * @param positionId - Position public key (already closed on blockchain)
   * @param walletAddress - User's wallet address for validation
   * @param transactionSignature - Optional tx signature from blockchain close
   * @returns PnL data including realized PnL, fees, IL, etc.
   */
  async closePosition(
    positionId: string,
    walletAddress: string,
    transactionSignature?: string
  ): Promise<ClosePositionResult> {
    console.log('Closing position via MCP:', positionId.substring(0, 8) + '...');
    return this.callTool<ClosePositionResult>('close_position', {
      positionId,
      walletAddress,
      closeOnBlockchain: false, // ← CRITICAL: We don't want MCP to touch blockchain
      transactionSignature,
    });
  }

  async healthCheck(): Promise<boolean> {
    try {
      await axios.get(this.baseURL + '/health', { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}

export const mcpClient = new MCPClient();
