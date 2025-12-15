/**
 * Credits Service
 *
 * Manages pay-per-use credits system ($0.01 USDC per reposition).
 * Users can purchase credits and use them for auto-repositions.
 *
 * Pricing Model:
 * - $10 = 1000 credits (never expire)
 * - 1 credit = 1 auto-reposition
 * - Credits never expire
 *
 * Credit Packages:
 * - Starter: $10 → 1000 credits (1000 repositions)
 * - Power: $25 → 2500 credits (2500 repositions)
 * - Pro: $50 → 5000 credits (5000 repositions)
 */

import { PrismaClient } from '@prisma/client';
import { database } from './database.js';
import { logger } from '../config.js';

interface PurchaseCreditsInput {
  walletAddress: string;
  creditsAmount: number; // Number of credits to purchase
  usdcAmountPaid: number; // USDC amount paid
  paymentTxSignature: string;
  x402PaymentProof: string;
}

interface UseCreditsInput {
  walletAddress: string;
  amount: number; // Credits to deduct
  positionAddress?: string; // Optional - for reposition operations
  description?: string; // Optional - description of usage
  relatedResourceId?: string; // Optional - for non-position operations (queries, analysis, etc.)
}

interface CreditBalance {
  balance: number;
  totalPurchased: number;
  totalUsed: number;
}

/**
 * Credits Service for pay-per-use model
 */
class CreditsService {
  private prisma: PrismaClient;
  private readonly CREDIT_PRICE = 0.01; // $0.01 USD per credit

  constructor() {
    this.prisma = database.getClient();
  }

  /**
   * Get credit balance for a wallet
   */
  async getBalance(walletAddress: string): Promise<CreditBalance> {
    try {
      let credits = await this.prisma.user_credits.findUnique({
        where: { walletAddress },
      });

      // Create if doesn't exist
      if (!credits) {
        credits = await this.prisma.user_credits.create({
          data: {
            walletAddress,
            balance: 0,
            totalPurchased: 0,
            totalUsed: 0,
          },
        });
      }

      return {
        balance: credits.balance.toNumber(),
        totalPurchased: credits.totalPurchased.toNumber(),
        totalUsed: credits.totalUsed.toNumber(),
      };
    } catch (error) {
      logger.error('Error getting credit balance:', error);
      throw new Error('Failed to get credit balance');
    }
  }

  /**
   * Check if wallet has sufficient credits
   */
  async hasCredits(walletAddress: string, amount: number): Promise<boolean> {
    try {
      const balance = await this.getBalance(walletAddress);
      return balance.balance >= amount;
    } catch (error) {
      logger.error('Error checking credits:', error);
      return false;
    }
  }

  /**
   * Purchase credits with x402 payment
   */
  async purchaseCredits(input: PurchaseCreditsInput): Promise<CreditBalance> {
    try {
      const currentBalance = await this.getBalance(input.walletAddress);

      // Calculate new balances
      const newBalance = currentBalance.balance + input.creditsAmount;
      const newTotalPurchased = currentBalance.totalPurchased + input.creditsAmount;

      // Use transaction to ensure atomicity
      const result = await this.prisma.$transaction(async (tx) => {
        // Update credits balance
        const updatedCredits = await tx.user_credits.update({
          where: { walletAddress: input.walletAddress },
          data: {
            balance: newBalance,
            totalPurchased: newTotalPurchased,
          },
        });

        // Record transaction
        await tx.credit_transactions.create({
          data: {
            walletAddress: input.walletAddress,
            type: 'purchase',
            amount: input.creditsAmount,
            balanceBefore: currentBalance.balance,
            balanceAfter: newBalance,
            description: `Purchased ${input.creditsAmount} credits`,
            paymentTxSignature: input.paymentTxSignature,
            x402PaymentProof: input.x402PaymentProof,
            usdcAmountPaid: input.usdcAmountPaid,
          },
        });

        return updatedCredits;
      });

      logger.info('Credits purchased successfully', {
        walletAddress: input.walletAddress.slice(0, 8) + '...',
        amount: input.creditsAmount,
        newBalance: result.balance.toNumber(),
      });

      return {
        balance: result.balance.toNumber(),
        totalPurchased: result.totalPurchased.toNumber(),
        totalUsed: result.totalUsed.toNumber(),
      };
    } catch (error) {
      logger.error('Error purchasing credits:', error);
      throw new Error('Failed to purchase credits');
    }
  }

  /**
   * Use credits for auto-reposition
   */
  async useCredits(input: UseCreditsInput): Promise<CreditBalance> {
    try {
      const currentBalance = await this.getBalance(input.walletAddress);

      // Check sufficient balance
      if (currentBalance.balance < input.amount) {
        throw new Error(`Insufficient credits. Required: ${input.amount}, Available: ${currentBalance.balance}`);
      }

      // Calculate new balances
      const newBalance = currentBalance.balance - input.amount;
      const newTotalUsed = currentBalance.totalUsed + input.amount;

      // Use transaction to ensure atomicity
      const result = await this.prisma.$transaction(async (tx) => {
        // Update credits balance
        const updatedCredits = await tx.user_credits.update({
          where: { walletAddress: input.walletAddress },
          data: {
            balance: newBalance,
            totalUsed: newTotalUsed,
          },
        });

        // Record transaction
        await tx.credit_transactions.create({
          data: {
            walletAddress: input.walletAddress,
            type: 'usage',
            amount: -input.amount, // Negative for usage
            balanceBefore: currentBalance.balance,
            balanceAfter: newBalance,
            description: input.description || 'Credit usage',
            relatedResourceId: input.relatedResourceId || input.positionAddress,
          },
        });

        return updatedCredits;
      });

      logger.info('Credits used successfully', {
        walletAddress: input.walletAddress.slice(0, 8) + '...',
        amount: input.amount,
        newBalance: result.balance.toNumber(),
      });

      return {
        balance: result.balance.toNumber(),
        totalPurchased: result.totalPurchased.toNumber(),
        totalUsed: result.totalUsed.toNumber(),
      };
    } catch (error) {
      logger.error('Error using credits:', error);
      throw error;
    }
  }

  /**
   * Get credit transaction history
   */
  async getTransactionHistory(
    walletAddress: string,
    limit = 50
  ): Promise<Array<{
    id: string;
    type: string;
    amount: number;
    balanceAfter: number;
    description: string | null;
    createdAt: Date;
  }>> {
    try {
      const transactions = await this.prisma.credit_transactions.findMany({
        where: { walletAddress },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      return transactions.map((tx) => ({
        id: tx.id,
        type: tx.type,
        amount: tx.amount.toNumber(),
        balanceAfter: tx.balanceAfter.toNumber(),
        description: tx.description,
        createdAt: tx.createdAt,
      }));
    } catch (error) {
      logger.error('Error getting transaction history:', error);
      throw new Error('Failed to get transaction history');
    }
  }

  /**
   * Calculate credit price in USDC
   */
  calculatePrice(credits: number): number {
    return credits * this.CREDIT_PRICE;
  }

  /**
   * Get credit statistics
   */
  async getStats(walletAddress: string): Promise<{
    balance: number;
    totalPurchased: number;
    totalUsed: number;
    totalSpent: number;
    averageRepositionCost: number;
    repositionsRemaining: number;
  }> {
    try {
      const balance = await this.getBalance(walletAddress);
      const totalSpent = balance.totalPurchased * this.CREDIT_PRICE;

      return {
        balance: balance.balance,
        totalPurchased: balance.totalPurchased,
        totalUsed: balance.totalUsed,
        totalSpent,
        averageRepositionCost: this.CREDIT_PRICE,
        repositionsRemaining: Math.floor(balance.balance / 1), // 1 credit per reposition
      };
    } catch (error) {
      logger.error('Error getting credit stats:', error);
      throw new Error('Failed to get credit stats');
    }
  }

  /**
   * Give bonus credits (admin function)
   */
  async giveBonusCredits(
    walletAddress: string,
    amount: number,
    reason: string
  ): Promise<CreditBalance> {
    try {
      const currentBalance = await this.getBalance(walletAddress);
      const newBalance = currentBalance.balance + amount;
      const newTotalPurchased = currentBalance.totalPurchased + amount;

      const result = await this.prisma.$transaction(async (tx) => {
        const updatedCredits = await tx.user_credits.update({
          where: { walletAddress },
          data: {
            balance: newBalance,
            totalPurchased: newTotalPurchased,
          },
        });

        await tx.credit_transactions.create({
          data: {
            walletAddress,
            type: 'bonus',
            amount: amount,
            balanceBefore: currentBalance.balance,
            balanceAfter: newBalance,
            description: `Bonus credits: ${reason}`,
          },
        });

        return updatedCredits;
      });

      logger.info('Bonus credits given', {
        walletAddress: walletAddress.slice(0, 8) + '...',
        amount,
        reason,
      });

      return {
        balance: result.balance.toNumber(),
        totalPurchased: result.totalPurchased.toNumber(),
        totalUsed: result.totalUsed.toNumber(),
      };
    } catch (error) {
      logger.error('Error giving bonus credits:', error);
      throw new Error('Failed to give bonus credits');
    }
  }
}

// Singleton instance
export const creditsService = new CreditsService();

// Export types
export type { PurchaseCreditsInput, UseCreditsInput, CreditBalance };
