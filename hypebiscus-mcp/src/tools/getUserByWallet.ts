// Tool: get_user_by_wallet - Get user info and stats by Solana wallet address
import { logger } from '../config.js';
import { dbUtils } from '../services/database.js';
import { validateSolanaAddress } from '../utils/validation.js';
import { withErrorHandling, formatError } from '../utils/errors.js';
import { withCache } from '../utils/cache.js';
import {
  GetUserByWalletInput,
  UserInfo,
  decimalToNumber,
  DatabaseError,
  DatabaseErrorType,
} from '../types/database.js';

/**
 * Gets user information by wallet address
 * @param input - Wallet address
 * @returns User info with wallet and stats
 */
export async function getUserByWallet(input: GetUserByWalletInput): Promise<UserInfo> {
  return withErrorHandling(async () => {
    const { walletAddress } = input;

    logger.info(`Fetching user by wallet: ${walletAddress}`);

    // Validate wallet address
    validateSolanaAddress(walletAddress);

    // Create cache key
    const cacheKey = `user:wallet:${walletAddress}`;

    // Try cache first
    const cachedResult = await withCache(
      cacheKey,
      async () => {
        // Query database
        const user = await dbUtils.findUserByWallet(walletAddress);

        if (!user) {
          throw new DatabaseError(
            DatabaseErrorType.USER_NOT_FOUND,
            `No user found with wallet address: ${walletAddress}`,
            'This wallet address is not registered in the system'
          );
        }

        // Transform to output format
        const userInfo: UserInfo = {
          id: user.id,
          telegramId: user.telegramId.toString(),
          username: user.username,
          isMonitoring: user.isMonitoring,
          createdAt: user.createdAt.toISOString(),
          wallet: {
            publicKey: user.wallets!.publicKey,
            createdAt: user.wallets!.createdAt.toISOString(),
          },
          stats: user.user_stats
            ? {
                totalPositions: user.user_stats.totalPositions ?? 0,
                activePositions: user.user_stats.activePositions ?? 0,
                totalZbtcFees: decimalToNumber(user.user_stats.totalZbtcFees) ?? 0,
                totalSolFees: decimalToNumber(user.user_stats.totalSolFees) ?? 0,
                totalPnlUsd: decimalToNumber(user.user_stats.totalPnlUsd) ?? 0,
                avgPositionSize: decimalToNumber(user.user_stats.avgPositionSize) ?? 0,
                avgHoldTime: user.user_stats.avgHoldTime ?? 0,
                updatedAt: user.user_stats.updatedAt?.toISOString() ?? new Date().toISOString(),
              }
            : null,
        };

        return userInfo;
      },
      60 // Cache for 60 seconds
    );

    logger.info(
      `Successfully fetched user ${cachedResult.username || cachedResult.id} (${cachedResult.stats?.totalPositions ?? 0} positions)`
    );

    return cachedResult;
  }, 'get user by wallet');
}

/**
 * Formats user info as human-readable string
 * @param userInfo - User information
 * @returns Formatted string
 */
export function formatUserInfo(userInfo: UserInfo): string {
  const lines: string[] = [];

  lines.push('User Information');
  lines.push('='.repeat(50));
  lines.push('');

  lines.push('Profile:');
  lines.push(`  User ID: ${userInfo.id}`);
  if (userInfo.username) {
    lines.push(`  Username: ${userInfo.username}`);
  }
  lines.push(`  Telegram ID: ${userInfo.telegramId}`);
  lines.push(`  Monitoring: ${userInfo.isMonitoring ? 'Enabled' : 'Disabled'}`);
  lines.push(`  Joined: ${new Date(userInfo.createdAt).toLocaleString()}`);
  lines.push('');

  lines.push('Wallet:');
  lines.push(`  Address: ${userInfo.wallet.publicKey}`);
  lines.push(`  Connected: ${new Date(userInfo.wallet.createdAt).toLocaleString()}`);
  lines.push('');

  if (userInfo.stats) {
    const stats = userInfo.stats;
    lines.push('Statistics:');
    lines.push(`  Total Positions: ${stats.totalPositions}`);
    lines.push(`  Active Positions: ${stats.activePositions}`);
    lines.push(`  Closed Positions: ${stats.totalPositions - stats.activePositions}`);
    lines.push('');

    lines.push('Performance:');
    lines.push(`  Total PnL: $${stats.totalPnlUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    lines.push('');

    lines.push('Fees Collected:');
    lines.push(`  zBTC: ${stats.totalZbtcFees.toFixed(8)} zBTC`);
    lines.push(`  SOL: ${stats.totalSolFees.toFixed(4)} SOL`);
    lines.push('');

    lines.push('Averages:');
    lines.push(`  Position Size: $${stats.avgPositionSize.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    const avgDays = Math.floor(stats.avgHoldTime / 86400);
    const avgHours = Math.floor((stats.avgHoldTime % 86400) / 3600);
    lines.push(`  Hold Time: ${avgDays}d ${avgHours}h`);
    lines.push('');

    lines.push(`Last Updated: ${new Date(stats.updatedAt).toLocaleString()}`);
  } else {
    lines.push('Statistics: No data available yet');
  }

  return lines.join('\n');
}

/**
 * Formats error for tool response
 * @param error - The error
 * @returns Formatted error message
 */
export function formatUserError(error: unknown): string {
  return `Failed to fetch user information.\n\n${formatError(error)}\n\nPlease check the wallet address and try again.`;
}
