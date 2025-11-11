/**
 * Subscription Middleware
 *
 * Middleware to check subscription status before executing premium MCP tools.
 * Integrates with x402Service for payment verification.
 *
 * Flow:
 * 1. Check if tool requires subscription
 * 2. Extract wallet address from tool arguments
 * 3. Check subscription status in database
 * 4. If no active subscription, return error
 * 5. Allow execution if subscription is active
 *
 * Premium Tools (require subscription):
 * - prepare_reposition (auto-reposition execution)
 * - analyze_reposition (AI-powered analysis)
 * - update_reposition_settings (with autoRepositionEnabled: true)
 *
 * Free Tools (no subscription required):
 * - get_pool_metrics
 * - get_user_positions_with_sync
 * - get_wallet_performance
 * - get_linked_account
 * - All read-only tools
 */

import { subscriptionService } from '../services/subscriptionService.js';
import { logger } from '../config.js';

interface SubscriptionCheckResult {
  allowed: boolean;
  reason?: string;
  subscriptionStatus?: {
    isActive: boolean;
    daysRemaining: number | null;
    tier: string;
  };
}

/**
 * Tools that require an active subscription
 */
const PREMIUM_TOOLS = new Set([
  'prepare_reposition', // Preparing reposition transactions
  // Future premium tools:
  // 'analyze_reposition', // AI-powered analysis (if we add AI features)
  // 'execute_auto_reposition', // Auto-execution (when implemented)
]);

/**
 * Tools that are always free (read-only)
 */
const FREE_TOOLS = new Set([
  'get_pool_metrics',
  'get_user_by_wallet',
  'get_wallet_performance',
  'get_bin_distribution',
  'calculate_rebalance',
  'get_user_positions_with_sync',
  'analyze_reposition', // Analysis is free, execution requires subscription
  'get_position_chain',
  'get_wallet_reposition_stats',
  'generate_wallet_link_token',
  'link_wallet',
  'link_wallet_by_short_token',
  'get_linked_account',
  'unlink_wallet',
  'get_reposition_settings',
  'update_reposition_settings', // Settings management is free
]);

/**
 * Extract wallet address from tool arguments
 */
function extractWalletAddress(toolName: string, args: Record<string, unknown>): string | null {
  // Direct wallet address parameter
  if (args.walletAddress && typeof args.walletAddress === 'string') {
    return args.walletAddress;
  }

  // Position-based tools: need to fetch position owner (would require on-chain lookup)
  // For now, we require walletAddress to be passed explicitly
  if (args.positionAddress && typeof args.positionAddress === 'string') {
    logger.warn('Position-based tool without walletAddress', {
      toolName,
      positionAddress: args.positionAddress,
    });
    return null;
  }

  // Telegram user ID (would need to look up linked wallet)
  if (args.telegramUserId && typeof args.telegramUserId === 'string') {
    // TODO: Look up linked wallet from database
    logger.warn('Telegram-based tool without walletAddress', {
      toolName,
      telegramUserId: args.telegramUserId,
    });
    return null;
  }

  return null;
}

/**
 * Check if tool execution requires subscription
 */
export async function checkSubscription(
  toolName: string,
  args: Record<string, unknown>
): Promise<SubscriptionCheckResult> {
  // Free tools don't require subscription
  if (FREE_TOOLS.has(toolName)) {
    return {
      allowed: true,
      reason: 'Tool is free to use',
    };
  }

  // Premium tools require subscription
  if (!PREMIUM_TOOLS.has(toolName)) {
    // Unknown tool - allow by default (fail open for now)
    logger.warn('Unknown tool not in premium or free list', { toolName });
    return {
      allowed: true,
      reason: 'Tool not categorized, allowing access',
    };
  }

  // Extract wallet address
  const walletAddress = extractWalletAddress(toolName, args);

  if (!walletAddress) {
    return {
      allowed: false,
      reason: 'Wallet address required for premium tools. Please provide walletAddress parameter.',
    };
  }

  // Check subscription status
  try {
    const status = await subscriptionService.getSubscriptionStatus(walletAddress);

    if (status.isActive) {
      return {
        allowed: true,
        subscriptionStatus: {
          isActive: true,
          daysRemaining: status.daysRemaining,
          tier: status.subscription?.tier ?? 'free',
        },
      };
    }

    // No active subscription
    return {
      allowed: false,
      reason: `Premium feature requires active subscription. Current status: ${
        status.subscription?.status ?? 'no subscription'
      }. Subscribe at https://hypebiscus.com/subscribe`,
      subscriptionStatus: {
        isActive: false,
        daysRemaining: null,
        tier: 'free',
      },
    };
  } catch (error) {
    logger.error('Error checking subscription:', error);

    // Fail open in case of database errors (don't block users)
    return {
      allowed: true,
      reason: 'Subscription check failed, allowing access',
    };
  }
}

/**
 * Format subscription error message for user
 */
export function formatSubscriptionError(result: SubscriptionCheckResult): string {
  if (result.allowed) {
    return '';
  }

  const message = [
    '❌ Premium Feature Locked',
    '',
    result.reason ?? 'This feature requires an active subscription.',
    '',
    '💎 Hypebiscus Premium - $4.99/month',
    '✅ Unlimited auto-repositions',
    '✅ AI-powered rebalance recommendations',
    '✅ Telegram notifications',
    '✅ Priority support',
    '',
    '🔗 Subscribe: https://hypebiscus.com/subscribe',
  ].join('\n');

  return message;
}

/**
 * Check if a specific feature is enabled for subscription tier
 */
export function isFeatureEnabled(tier: string, feature: string): boolean {
  if (tier === 'premium') {
    return true; // Premium has access to all features
  }

  // Free tier features
  const FREE_FEATURES = new Set([
    'view_positions',
    'view_performance',
    'wallet_linking',
    'read_only_tools',
  ]);

  return FREE_FEATURES.has(feature);
}

/**
 * Middleware wrapper for tool execution
 */
export async function withSubscriptionCheck<T>(
  toolName: string,
  args: Record<string, unknown>,
  handler: () => Promise<T>
): Promise<T> {
  const check = await checkSubscription(toolName, args);

  if (!check.allowed) {
    const errorMessage = formatSubscriptionError(check);
    throw new Error(errorMessage);
  }

  // Log subscription usage
  if (check.subscriptionStatus?.isActive) {
    logger.info('Premium tool executed', {
      toolName,
      walletAddress: extractWalletAddress(toolName, args),
      daysRemaining: check.subscriptionStatus.daysRemaining,
    });
  }

  return handler();
}

// Export for use in tool handlers
export { PREMIUM_TOOLS, FREE_TOOLS, extractWalletAddress };
