/**
 * Subscription Service
 *
 * Manages user subscriptions in the database.
 * Works with x402Service to verify payments before creating/updating subscriptions.
 *
 * Subscription Lifecycle:
 * 1. User pays via x402 on website
 * 2. Payment verified with facilitator
 * 3. Subscription created (30-day period)
 * 4. Auto-reposition monitor checks subscription status
 * 5. Subscription expires or renews
 *
 * Subscription Tiers:
 * - free: Read-only access, no auto-reposition
 * - premium: $4.99/month, unlimited auto-reposition
 */

import { PrismaClient } from '@prisma/client';
import { database } from './database.js';
import { logger } from '../config.js';

type SubscriptionTier = 'free' | 'premium';
type SubscriptionStatus = 'active' | 'cancelled' | 'expired';

interface CreateSubscriptionInput {
  walletAddress: string;
  paymentTxSignature: string;
  x402PaymentProof: string;
}

interface Subscription {
  id: string;
  walletAddress: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  paymentTxSignature: string | null;
  x402PaymentProof: string | null;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  autoRenew: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface SubscriptionStatusResult {
  hasSubscription: boolean;
  isActive: boolean;
  subscription: Subscription | null;
  daysRemaining: number | null;
}

/**
 * Subscription Service for managing user subscriptions
 */
class SubscriptionService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = database.getClient();
  }

  /**
   * Create a new subscription after payment verification
   */
  async createSubscription(input: CreateSubscriptionInput): Promise<Subscription> {
    try {
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setDate(periodEnd.getDate() + 30); // 30-day subscription

      const subscription = await this.prisma.user_subscriptions.create({
        data: {
          walletAddress: input.walletAddress,
          tier: 'premium',
          status: 'active',
          paymentTxSignature: input.paymentTxSignature,
          x402PaymentProof: input.x402PaymentProof,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          autoRenew: true,
        },
      });

      logger.info('Subscription created', {
        walletAddress: input.walletAddress,
        tier: 'premium',
        expiresAt: periodEnd.toISOString(),
      });

      return subscription as Subscription;
    } catch (error) {
      logger.error('Error creating subscription:', error);
      throw new Error('Failed to create subscription');
    }
  }

  /**
   * Get subscription by wallet address
   */
  async getSubscription(walletAddress: string): Promise<Subscription | null> {
    try {
      const subscription = await this.prisma.user_subscriptions.findUnique({
        where: { walletAddress },
      });

      return subscription as Subscription | null;
    } catch (error) {
      logger.error('Error getting subscription:', error);
      return null;
    }
  }

  /**
   * Check if subscription is active
   */
  async isSubscriptionActive(walletAddress: string): Promise<boolean> {
    try {
      const subscription = await this.getSubscription(walletAddress);

      if (!subscription) {
        return false;
      }

      const now = new Date();
      const isActive =
        subscription.status === 'active' && subscription.currentPeriodEnd > now;

      return isActive;
    } catch (error) {
      logger.error('Error checking subscription status:', error);
      return false;
    }
  }

  /**
   * Get detailed subscription status
   */
  async getSubscriptionStatus(walletAddress: string): Promise<SubscriptionStatusResult> {
    try {
      const subscription = await this.getSubscription(walletAddress);

      if (!subscription) {
        return {
          hasSubscription: false,
          isActive: false,
          subscription: null,
          daysRemaining: null,
        };
      }

      const now = new Date();
      const isActive =
        subscription.status === 'active' && subscription.currentPeriodEnd > now;

      let daysRemaining: number | null = null;
      if (isActive) {
        const msRemaining = subscription.currentPeriodEnd.getTime() - now.getTime();
        daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));
      }

      return {
        hasSubscription: true,
        isActive,
        subscription,
        daysRemaining,
      };
    } catch (error) {
      logger.error('Error getting subscription status:', error);
      return {
        hasSubscription: false,
        isActive: false,
        subscription: null,
        daysRemaining: null,
      };
    }
  }

  /**
   * Update subscription (renew, cancel, etc.)
   */
  async updateSubscription(
    walletAddress: string,
    updates: {
      status?: SubscriptionStatus;
      autoRenew?: boolean;
      currentPeriodEnd?: Date;
    }
  ): Promise<Subscription | null> {
    try {
      const subscription = await this.prisma.user_subscriptions.update({
        where: { walletAddress },
        data: {
          ...updates,
          updatedAt: new Date(),
        },
      });

      logger.info('Subscription updated', {
        walletAddress,
        updates,
      });

      return subscription as Subscription;
    } catch (error) {
      logger.error('Error updating subscription:', error);
      return null;
    }
  }

  /**
   * Cancel subscription (set status to cancelled)
   */
  async cancelSubscription(walletAddress: string): Promise<boolean> {
    try {
      await this.updateSubscription(walletAddress, {
        status: 'cancelled',
        autoRenew: false,
      });

      logger.info('Subscription cancelled', { walletAddress });
      return true;
    } catch (error) {
      logger.error('Error cancelling subscription:', error);
      return false;
    }
  }

  /**
   * Renew subscription (extend period by 30 days)
   */
  async renewSubscription(
    walletAddress: string,
    paymentTxSignature: string,
    x402PaymentProof: string
  ): Promise<Subscription | null> {
    try {
      const subscription = await this.getSubscription(walletAddress);

      if (!subscription) {
        // Create new subscription
        return this.createSubscription({
          walletAddress,
          paymentTxSignature,
          x402PaymentProof,
        });
      }

      // Extend existing subscription
      const now = new Date();
      const currentEnd = subscription.currentPeriodEnd;
      const newEnd = new Date(currentEnd > now ? currentEnd : now);
      newEnd.setDate(newEnd.getDate() + 30);

      const updated = await this.prisma.user_subscriptions.update({
        where: { walletAddress },
        data: {
          status: 'active',
          paymentTxSignature,
          x402PaymentProof,
          currentPeriodStart: now,
          currentPeriodEnd: newEnd,
          updatedAt: now,
        },
      });

      logger.info('Subscription renewed', {
        walletAddress,
        newExpiry: newEnd.toISOString(),
      });

      return updated as Subscription;
    } catch (error) {
      logger.error('Error renewing subscription:', error);
      return null;
    }
  }

  /**
   * Expire old subscriptions (cron job)
   * Should be called periodically to mark expired subscriptions
   */
  async expireOldSubscriptions(): Promise<number> {
    try {
      const now = new Date();

      const result = await this.prisma.user_subscriptions.updateMany({
        where: {
          status: 'active',
          currentPeriodEnd: {
            lt: now,
          },
        },
        data: {
          status: 'expired',
          updatedAt: now,
        },
      });

      if (result.count > 0) {
        logger.info('Expired subscriptions updated', { count: result.count });
      }

      return result.count;
    } catch (error) {
      logger.error('Error expiring subscriptions:', error);
      return 0;
    }
  }

  /**
   * Get all active subscriptions (for monitoring)
   */
  async getActiveSubscriptions(): Promise<Subscription[]> {
    try {
      const now = new Date();

      const subscriptions = await this.prisma.user_subscriptions.findMany({
        where: {
          status: 'active',
          currentPeriodEnd: {
            gt: now,
          },
        },
        orderBy: {
          currentPeriodEnd: 'asc',
        },
      });

      return subscriptions as Subscription[];
    } catch (error) {
      logger.error('Error getting active subscriptions:', error);
      return [];
    }
  }

  /**
   * Get subscriptions expiring soon (within N days)
   */
  async getExpiringSubscriptions(daysThreshold = 7): Promise<Subscription[]> {
    try {
      const now = new Date();
      const threshold = new Date(now);
      threshold.setDate(threshold.getDate() + daysThreshold);

      const subscriptions = await this.prisma.user_subscriptions.findMany({
        where: {
          status: 'active',
          currentPeriodEnd: {
            gt: now,
            lte: threshold,
          },
        },
        orderBy: {
          currentPeriodEnd: 'asc',
        },
      });

      return subscriptions as Subscription[];
    } catch (error) {
      logger.error('Error getting expiring subscriptions:', error);
      return [];
    }
  }

  /**
   * Record reposition execution for subscription tracking
   */
  async recordRepositionExecution(input: {
    walletAddress: string;
    positionAddress: string;
    success: boolean;
    gasCostSol?: number;
    feesCollectedUsd?: number;
    error?: string;
    transactionSignature?: string;
    executionReason?: string;
    executionMode?: 'auto' | 'manual';
  }): Promise<void> {
    try {
      const subscription = await this.getSubscription(input.walletAddress);

      await this.prisma.reposition_executions.create({
        data: {
          walletAddress: input.walletAddress,
          positionAddress: input.positionAddress,
          subscriptionId: subscription?.id ?? null,
          success: input.success,
          gasCostSol: input.gasCostSol ?? null,
          feesCollectedUsd: input.feesCollectedUsd ?? null,
          error: input.error ?? null,
          transactionSignature: input.transactionSignature ?? null,
          executionReason: input.executionReason ?? null,
          executionMode: input.executionMode ?? 'manual',
        },
      });

      logger.debug('Reposition execution recorded', {
        walletAddress: input.walletAddress,
        success: input.success,
      });
    } catch (error) {
      logger.error('Error recording reposition execution:', error);
    }
  }

  /**
   * Get reposition execution stats for a wallet
   */
  async getRepositionStats(walletAddress: string): Promise<{
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    totalGasCostSol: number;
    totalFeesCollectedUsd: number;
  }> {
    try {
      const executions = await this.prisma.reposition_executions.findMany({
        where: { walletAddress },
      });

      const stats = executions.reduce(
        (acc, exec) => {
          acc.totalExecutions++;
          if (exec.success) {
            acc.successfulExecutions++;
          } else {
            acc.failedExecutions++;
          }
          acc.totalGasCostSol += Number(exec.gasCostSol ?? 0);
          acc.totalFeesCollectedUsd += Number(exec.feesCollectedUsd ?? 0);
          return acc;
        },
        {
          totalExecutions: 0,
          successfulExecutions: 0,
          failedExecutions: 0,
          totalGasCostSol: 0,
          totalFeesCollectedUsd: 0,
        }
      );

      return stats;
    } catch (error) {
      logger.error('Error getting reposition stats:', error);
      return {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        totalGasCostSol: 0,
        totalFeesCollectedUsd: 0,
      };
    }
  }
}

// Singleton instance
export const subscriptionService = new SubscriptionService();

// Export types
export type {
  SubscriptionTier,
  SubscriptionStatus,
  Subscription,
  SubscriptionStatusResult,
  CreateSubscriptionInput,
};
