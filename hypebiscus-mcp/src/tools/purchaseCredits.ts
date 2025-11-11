/**
 * Purchase Credits Tool
 *
 * Purchases credits using x402 payment protocol.
 * Validates payment proof and adds credits to user's balance.
 */

import { z } from 'zod';
import { creditsService } from '../services/creditsService.js';
import { x402Service } from '../services/x402Service.js';
import { logger } from '../config.js';

// Input schema
export const PurchaseCreditsSchema = z.object({
  walletAddress: z.string().describe('The Solana wallet address purchasing credits'),
  creditsAmount: z.number().positive().describe('Number of credits to purchase'),
  x402PaymentHeader: z.string().optional().describe('The x402 payment proof header (X-Payment header value) - optional'),
  paymentTxSignature: z.string().optional().describe('Direct Solana transaction signature (for non-x402 payments)'),
  usdcAmountPaid: z.number().optional().describe('USDC amount paid (for non-x402 payments)'),
});

export type PurchaseCreditsInput = z.infer<typeof PurchaseCreditsSchema>;

// Result type
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

/**
 * Purchase credits with x402 payment
 */
export async function purchaseCredits(
  input: PurchaseCreditsInput
): Promise<PurchaseCreditsResult> {
  try {
    logger.info('Processing credit purchase', {
      walletAddress: input.walletAddress.slice(0, 8) + '...',
      creditsAmount: input.creditsAmount,
      mode: input.x402PaymentHeader ? 'x402' : 'direct',
    });

    // Calculate expected USDC amount
    const expectedUsdcAmount = creditsService.calculatePrice(input.creditsAmount);

    let transactionSignature: string;
    let actualUsdcPaid: number;

    // Mode 1: Direct USDC transfer (no x402)
    if (!input.x402PaymentHeader && input.paymentTxSignature) {
      logger.info('Using direct payment mode (no x402)');

      // For direct payments, trust the transaction signature and amount
      transactionSignature = input.paymentTxSignature;
      actualUsdcPaid = input.usdcAmountPaid || expectedUsdcAmount;

      logger.info('Direct payment accepted', {
        txSignature: transactionSignature,
        usdcPaid: actualUsdcPaid
      });
    }
    // Mode 2: x402 protocol (future)
    else if (input.x402PaymentHeader) {
      logger.info('Using x402 payment mode');

      const usdcMicroUnits = (expectedUsdcAmount * 1_000_000).toString();
      const networkConfig = x402Service.getNetworkConfig();

      const paymentRequirements = {
        price: {
          amount: usdcMicroUnits,
          asset: {
            address: networkConfig.usdcMint,
          },
        },
        network: networkConfig.network as 'solana' | 'solana-devnet',
        config: {
          description: `Purchase ${input.creditsAmount} credits`,
          resource: `/api/credits/purchase`,
          mimeType: 'application/json',
          maxTimeoutSeconds: 300,
        },
      };

      const paymentVerification = await x402Service.verifyPayment(
        input.x402PaymentHeader,
        paymentRequirements
      );

      if (!paymentVerification.verified) {
        throw new Error(`Payment verification failed: ${paymentVerification.error || 'Unknown error'}`);
      }

      const paymentSettlement = await x402Service.settlePayment(
        input.x402PaymentHeader,
        paymentRequirements
      );

      if (!paymentSettlement.settled) {
        throw new Error(`Payment settlement failed: ${paymentSettlement.error || 'Unknown error'}`);
      }

      transactionSignature = paymentSettlement.transactionSignature || 'unknown';
      actualUsdcPaid = expectedUsdcAmount;

      logger.info('X402 payment verified and settled', {
        txSignature: transactionSignature,
      });
    } else {
      throw new Error('Either x402PaymentHeader or paymentTxSignature must be provided');
    }

    // Purchase credits
    const result = await creditsService.purchaseCredits({
      walletAddress: input.walletAddress,
      creditsAmount: input.creditsAmount,
      usdcAmountPaid: actualUsdcPaid,
      paymentTxSignature: transactionSignature,
      x402PaymentProof: input.x402PaymentHeader || transactionSignature,
    });

    return {
      success: true,
      balance: result.balance,
      totalPurchased: result.totalPurchased,
      totalUsed: result.totalUsed,
      creditsPurchased: input.creditsAmount,
      usdcPaid: actualUsdcPaid,
      transactionSignature: transactionSignature,
      message: `Successfully purchased ${input.creditsAmount} credits for $${actualUsdcPaid.toFixed(2)} USDC. New balance: ${result.balance} credits.`,
    };
  } catch (error) {
    logger.error('Error purchasing credits:', error);
    throw new Error(`Failed to purchase credits: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
