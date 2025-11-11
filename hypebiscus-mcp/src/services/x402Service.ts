/**
 * X402 Payment Service
 *
 * Handles server-side payment verification and settlement for x402 protocol.
 * Uses PayAI Network facilitator for Solana micropayments.
 *
 * Architecture:
 * - Client sends X-PAYMENT header with payment authorization
 * - Server verifies payment with facilitator before executing MCP tool
 * - Server settles payment after successful tool execution
 *
 * Subscription Model:
 * - $4.99/month USDC (4990000 micro-units)
 * - 30-day subscription period
 * - Auto-renewal support via x402 protocol
 */

import { X402PaymentHandler } from 'x402-solana/server';
import { logger } from '../config.js';

// USDC mint addresses
const USDC_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

// Subscription pricing (USDC micro-units, 6 decimals)
const SUBSCRIPTION_PRICE_USD = 4.99;
const SUBSCRIPTION_PRICE_MICRO_USDC = '4990000'; // $4.99 USDC

// Network configuration
const NETWORK = process.env.SOLANA_NETWORK === 'mainnet-beta' ? 'solana' : 'solana-devnet';
const USDC_MINT = NETWORK === 'solana' ? USDC_MAINNET : USDC_DEVNET;

interface X402PaymentConfig {
  treasuryAddress: string;
  facilitatorUrl: string;
  rpcUrl?: string;
  network: 'solana' | 'solana-devnet';
}

interface PaymentRequirements {
  price: {
    amount: string;
    asset: {
      address: string;
    };
  };
  network: 'solana' | 'solana-devnet';
  config: {
    description: string;
    resource: string;
    mimeType?: string;
    maxTimeoutSeconds?: number;
  };
}

interface PaymentVerificationResult {
  verified: boolean;
  error?: string;
}

interface PaymentSettlementResult {
  settled: boolean;
  transactionSignature?: string;
  error?: string;
}

/**
 * X402 Payment Service for subscription management
 */
class X402Service {
  private handler: X402PaymentHandler | null = null;
  private config: X402PaymentConfig | null = null;
  private initialized = false;

  /**
   * Initialize the x402 payment handler
   */
  async initialize(config: X402PaymentConfig): Promise<void> {
    try {
      this.config = config;

      this.handler = new X402PaymentHandler({
        network: config.network,
        treasuryAddress: config.treasuryAddress,
        facilitatorUrl: config.facilitatorUrl,
        rpcUrl: config.rpcUrl,
        defaultToken: USDC_MINT,
      });

      this.initialized = true;

      logger.info('X402 Payment Service initialized', {
        network: config.network,
        treasury: config.treasuryAddress.slice(0, 8) + '...',
        facilitator: config.facilitatorUrl,
      });
    } catch (error) {
      logger.error('Failed to initialize X402 Payment Service:', error);
      throw new Error('X402 initialization failed');
    }
  }

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return this.initialized && this.handler !== null;
  }

  /**
   * Extract payment header from request headers
   */
  extractPayment(headers: Record<string, string | string[] | undefined>): string | null {
    if (!this.handler) {
      throw new Error('X402 service not initialized');
    }

    try {
      return this.handler.extractPayment(headers);
    } catch (error) {
      logger.error('Error extracting payment header:', error);
      return null;
    }
  }

  /**
   * Create payment requirements for subscription
   */
  async createSubscriptionPaymentRequirements(
    resourceUrl: string,
    description = 'Hypebiscus Premium Subscription'
  ): Promise<PaymentRequirements> {
    if (!this.handler) {
      throw new Error('X402 service not initialized');
    }

    try {
      const requirements = await this.handler.createPaymentRequirements({
        price: {
          amount: SUBSCRIPTION_PRICE_MICRO_USDC,
          asset: {
            address: USDC_MINT,
          },
        },
        network: this.config!.network,
        config: {
          description,
          resource: resourceUrl,
          mimeType: 'application/json',
          maxTimeoutSeconds: 300,
        },
      });

      return requirements;
    } catch (error) {
      logger.error('Error creating payment requirements:', error);
      throw new Error('Failed to create payment requirements');
    }
  }

  /**
   * Create 402 Payment Required response
   */
  create402Response(requirements: PaymentRequirements): { status: number; body: Record<string, unknown> } {
    if (!this.handler) {
      throw new Error('X402 service not initialized');
    }

    try {
      return this.handler.create402Response(requirements);
    } catch (error) {
      logger.error('Error creating 402 response:', error);
      throw new Error('Failed to create 402 response');
    }
  }

  /**
   * Verify payment with facilitator
   */
  async verifyPayment(
    paymentHeader: string,
    requirements: PaymentRequirements
  ): Promise<PaymentVerificationResult> {
    if (!this.handler) {
      throw new Error('X402 service not initialized');
    }

    try {
      const verified = await this.handler.verifyPayment(paymentHeader, requirements);

      if (verified) {
        logger.info('Payment verified successfully', {
          amount: requirements.price.amount,
          resource: requirements.config.resource,
        });
      } else {
        logger.warn('Payment verification failed', {
          resource: requirements.config.resource,
        });
      }

      return {
        verified,
        error: verified ? undefined : 'Payment verification failed',
      };
    } catch (error) {
      logger.error('Error verifying payment:', error);
      return {
        verified: false,
        error: error instanceof Error ? error.message : 'Payment verification error',
      };
    }
  }

  /**
   * Settle payment after successful service execution
   */
  async settlePayment(
    paymentHeader: string,
    requirements: PaymentRequirements
  ): Promise<PaymentSettlementResult> {
    if (!this.handler) {
      throw new Error('X402 service not initialized');
    }

    try {
      const settlementResult = await this.handler.settlePayment(paymentHeader, requirements);

      logger.info('Payment settled successfully', {
        amount: requirements.price.amount,
        resource: requirements.config.resource,
        result: settlementResult,
      });

      return {
        settled: true,
        transactionSignature: settlementResult?.signature,
      };
    } catch (error) {
      logger.error('Error settling payment:', error);
      return {
        settled: false,
        error: error instanceof Error ? error.message : 'Payment settlement error',
      };
    }
  }

  /**
   * Get subscription price in USD
   */
  getSubscriptionPriceUSD(): number {
    return SUBSCRIPTION_PRICE_USD;
  }

  /**
   * Get subscription price in USDC micro-units
   */
  getSubscriptionPriceMicroUSDC(): string {
    return SUBSCRIPTION_PRICE_MICRO_USDC;
  }

  /**
   * Get network configuration
   */
  getNetworkConfig(): { network: string; usdcMint: string } {
    return {
      network: NETWORK,
      usdcMint: USDC_MINT,
    };
  }
}

// Singleton instance
export const x402Service = new X402Service();

// Export types
export type {
  X402PaymentConfig,
  PaymentRequirements,
  PaymentVerificationResult,
  PaymentSettlementResult,
};
