/**
 * Check Subscription Status Tool
 *
 * Checks if a wallet address has an active subscription.
 * Used by Garden bot to verify subscription before auto-reposition execution.
 *
 * Input: { walletAddress: string }
 * Output: { isActive: boolean, tier: string, expiresAt: string, daysRemaining: number }
 */

import { z } from 'zod';
import { subscriptionService } from '../services/subscriptionService.js';
import { logger } from '../config.js';

// Input validation schema
export const CheckSubscriptionSchema = z.object({
  walletAddress: z.string().min(32).max(44).describe('Solana wallet address to check subscription for'),
});

export type CheckSubscriptionInput = z.infer<typeof CheckSubscriptionSchema>;

export interface CheckSubscriptionResult {
  isActive: boolean;
  tier?: string;
  status?: string;
  expiresAt?: string;
  daysRemaining?: number;
  message: string;
}

/**
 * Check subscription status for a wallet
 */
export async function checkSubscription(
  input: CheckSubscriptionInput
): Promise<CheckSubscriptionResult> {
  try {
    logger.info('Checking subscription', { walletAddress: input.walletAddress.slice(0, 8) + '...' });

    // Get subscription status from database
    const status = await subscriptionService.getSubscriptionStatus(input.walletAddress);

    if (!status.hasSubscription) {
      return {
        isActive: false,
        message: 'No subscription found for this wallet address.',
      };
    }

    if (!status.isActive) {
      return {
        isActive: false,
        tier: status.subscription?.tier || 'free',
        status: status.subscription?.status || 'expired',
        message: status.subscription?.status === 'cancelled'
          ? 'Subscription was cancelled. Please renew to continue using auto-reposition.'
          : 'Subscription has expired. Please renew to continue using auto-reposition.',
      };
    }

    // Active subscription
    return {
      isActive: true,
      tier: status.subscription?.tier || 'premium',
      status: 'active',
      expiresAt: status.subscription?.currentPeriodEnd.toISOString(),
      daysRemaining: status.daysRemaining || 0,
      message: `Active ${status.subscription?.tier || 'premium'} subscription. ${status.daysRemaining || 0} days remaining.`,
    };
  } catch (error) {
    logger.error('Error checking subscription:', error);

    return {
      isActive: false,
      message: `Error checking subscription: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
