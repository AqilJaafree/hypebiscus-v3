// MCP Client - HTTP client for communicating with Hypebiscus MCP Server
import axios, { AxiosInstance, AxiosError } from 'axios';

// Environment configuration
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3001';

// Type definitions
export interface LinkToken {
  token: string;
  shortToken: string;
  expiresAt: string;
  qrCodeData: string;
  deepLink: string;
  instructions: {
    method1_deepLink: string;
    method2_qrCode: string;
    method3_manual: string;
  };
}

export interface LinkedAccount {
  isLinked: boolean;
  telegramUserId?: string;
  telegramUsername?: string;
  walletAddress?: string;
  linkedAt?: string;
  source: 'telegram' | 'website';
}

export interface LinkResult {
  success: boolean;
  linkedAccount: {
    telegramUserId: string;
    telegramUsername?: string;
    walletAddress: string;
    linkedAt: string;
  };
  message: string;
}

export interface MCPError {
  error: string;
  message: string;
  details?: string;
}

export interface CreditBalance {
  balance: number;
  totalPurchased: number;
  totalUsed: number;
  message: string;
}

export interface PurchaseCreditsResult {
  success: boolean;
  balance: number;
  totalPurchased: number;
  totalUsed: number;
  creditsPurchased: number;
  usdcPaid: number;
  transactionSignature: string;
  message: string;
}

export interface UseCreditsResult {
  success: boolean;
  balance: number;
  totalPurchased: number;
  totalUsed: number;
  creditsUsed: number;
  message: string;
}

/**
 * MCP Client for Hypebiscus Garden Bot
 * Communicates with the MCP server via HTTP
 */
export class MCPClient {
  private client: AxiosInstance;

  constructor(serverUrl: string = MCP_SERVER_URL) {
    this.client = axios.create({
      baseURL: serverUrl,
      timeout: 10000, // 10 second timeout
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Generic MCP method caller
   */
  public async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    try {
      const response = await this.client.post<{
        result?: {
          content?: Array<{ type: string; text: string }>
        };
        error?: MCPError
      }>('/', {
        method,
        params,
      });

      if (response.data.error) {
        throw new Error(response.data.error.message || 'MCP server error');
      }

      if (!response.data.result) {
        throw new Error('No result returned from MCP server');
      }

      // Parse MCP protocol response format
      const content = response.data.result.content;
      if (content && content.length > 0 && content[0].text) {
        try {
          return JSON.parse(content[0].text) as T;
        } catch (parseError) {
          // If parsing fails, return the text as-is
          return content[0].text as T;
        }
      }

      // Fallback to direct result if no content wrapper
      return response.data.result as T;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError<{ error?: MCPError }>;
        if (axiosError.response?.data?.error) {
          throw new Error(
            axiosError.response.data.error.message || 'MCP server error'
          );
        }
        throw new Error(`HTTP error: ${axiosError.message}`);
      }
      throw error;
    }
  }

  /**
   * Generate wallet link token (website side - not typically called from bot)
   * @param walletAddress Solana wallet address
   * @param expiresInMinutes Token expiration time (default: 5 minutes)
   */
  async generateWalletLinkToken(
    walletAddress: string,
    expiresInMinutes: number = 5
  ): Promise<LinkToken> {
    return this.call<LinkToken>('generate_wallet_link_token', {
      walletAddress,
      expiresInMinutes,
    });
  }

  /**
   * Link wallet using full QR code token
   * @param token 64-character hex token from QR code
   * @param walletAddress Wallet address from QR code
   * @param telegramUserId Telegram user ID to link
   * @param expiresAt Expiration timestamp from QR code
   * @param signature HMAC signature from QR code
   */
  async linkWalletByFullToken(
    token: string,
    walletAddress: string,
    telegramUserId: string,
    expiresAt: string,
    signature: string
  ): Promise<LinkResult> {
    return this.call<LinkResult>('link_wallet', {
      token,
      walletAddress,
      telegramUserId,
      expiresAt,
      signature,
    });
  }

  /**
   * Link wallet using 8-character short token
   * @param shortToken 8-character code (e.g., "AB2C3D4E")
   * @param telegramUserId Telegram user ID to link
   */
  async linkWalletByShortToken(
    shortToken: string,
    telegramUserId: string
  ): Promise<LinkResult> {
    return this.call<LinkResult>('link_wallet_by_short_token', {
      shortToken: shortToken.toUpperCase().trim(),
      telegramUserId,
    });
  }

  /**
   * Get linked account information
   * @param telegramUserId Telegram user ID to check
   */
  async getLinkedAccount(telegramUserId: string): Promise<LinkedAccount> {
    const response = await this.call<{
      isLinked: boolean;
      linkedAccount?: {
        telegramUserId: string;
        telegramUsername?: string;
        walletAddress: string;
        linkedAt: string;
      };
      source?: string;
      message?: string;
    }>('get_linked_account', {
      telegramUserId,
    });

    // Handle nested response format from MCP server
    if (response.isLinked && response.linkedAccount) {
      return {
        isLinked: true,
        telegramUserId: response.linkedAccount.telegramUserId,
        telegramUsername: response.linkedAccount.telegramUsername,
        walletAddress: response.linkedAccount.walletAddress,
        linkedAt: response.linkedAccount.linkedAt,
        source: (response.source as 'telegram' | 'website') || 'telegram',
      };
    }

    return {
      isLinked: false,
      source: (response.source as 'telegram' | 'website') || 'telegram',
    };
  }

  /**
   * Unlink wallet from Telegram account
   * @param telegramUserId Telegram user ID to unlink
   */
  async unlinkWallet(telegramUserId: string): Promise<void> {
    await this.call<void>('unlink_wallet', {
      telegramUserId,
    });
  }

  /**
   * Get user positions with hybrid sync
   * @param walletAddress Wallet address to fetch positions for
   */
  async getUserPositions(walletAddress: string) {
    return this.call('get_user_positions_with_sync', {
      walletAddress,
    });
  }

  /**
   * Get pool metrics
   * @param poolAddress Pool address (optional)
   */
  async getPoolMetrics(poolAddress?: string) {
    return this.call('get_pool_metrics', {
      poolAddress,
    });
  }

  /**
   * Get user reposition settings
   * @param telegramUserId Telegram user ID
   */
  async getRepositionSettings(telegramUserId: string) {
    return this.call('get_reposition_settings', {
      telegramUserId,
    });
  }

  /**
   * Update user reposition settings
   * @param telegramUserId Telegram user ID
   * @param settings Settings to update
   */
  async updateRepositionSettings(
    telegramUserId: string,
    settings: Record<string, unknown>
  ) {
    return this.call('update_reposition_settings', {
      telegramUserId,
      settings,
      updatedFrom: 'telegram',
    });
  }

  /**
   * Check subscription status (via wallet address)
   * @param walletAddress Wallet address to check subscription for
   */
  async checkSubscription(walletAddress: string): Promise<{
    isActive: boolean;
    tier?: string;
    expiresAt?: string;
    daysRemaining?: number;
  }> {
    return this.call('check_subscription', {
      walletAddress,
    });
  }

  /**
   * Record reposition execution for tracking
   * @param data Execution data
   */
  async recordExecution(data: {
    walletAddress: string;
    positionAddress: string;
    success: boolean;
    gasCostSol?: number;
    feesCollectedUsd?: number;
    error?: string;
    transactionSignature?: string;
    executionMode?: 'auto' | 'manual';
  }) {
    return this.call('record_execution', {
      ...data,
      executionMode: data.executionMode || 'auto',
    });
  }

  /**
   * Get credit balance for a wallet
   * @param walletAddress Wallet address to check credits for
   */
  async getCreditBalance(walletAddress: string): Promise<CreditBalance> {
    return this.call<CreditBalance>('get_credit_balance', {
      walletAddress,
    });
  }

  /**
   * Purchase credits using x402 payment
   * @param walletAddress Wallet address purchasing credits
   * @param creditsAmount Number of credits to purchase
   * @param x402PaymentHeader x402 payment proof header (X-Payment header value)
   */
  async purchaseCredits(
    walletAddress: string,
    creditsAmount: number,
    x402PaymentHeader: string
  ): Promise<PurchaseCreditsResult> {
    return this.call<PurchaseCreditsResult>('purchase_credits', {
      walletAddress,
      creditsAmount,
      x402PaymentHeader,
    });
  }

  /**
   * Use credits for a reposition (deduct from balance)
   * Internal method - typically called by system after successful reposition
   * @param walletAddress Wallet address using credits
   * @param amount Number of credits to deduct
   * @param positionAddress Position address this credit usage is for
   * @param description Optional description of credit usage
   */
  async useCredits(
    walletAddress: string,
    amount: number,
    positionAddress: string,
    description?: string
  ): Promise<UseCreditsResult> {
    return this.call<UseCreditsResult>('use_credits', {
      walletAddress,
      amount,
      positionAddress,
      description,
    });
  }
}

// Export singleton instance
export const mcpClient = new MCPClient();

// Export for custom configurations
export default MCPClient;
