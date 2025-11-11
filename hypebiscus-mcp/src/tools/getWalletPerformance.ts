// Tool: get_wallet_performance - Get aggregated performance metrics for a wallet
import { logger } from '../config.js';
import { dbUtils } from '../services/database.js';
import { validateSolanaAddress } from '../utils/validation.js';
import { withErrorHandling, formatError } from '../utils/errors.js';
import { withCache } from '../utils/cache.js';
import {
  GetWalletPerformanceInput,
  WalletPerformance,
  PositionInfo,
  decimalToNumber,
  DatabaseError,
  DatabaseErrorType,
} from '../types/database.js';

/**
 * Gets aggregated performance metrics for a wallet
 * @param input - Wallet address
 * @returns Wallet performance data
 */
export async function getWalletPerformance(
  input: GetWalletPerformanceInput
): Promise<WalletPerformance> {
  return withErrorHandling(async () => {
    const { walletAddress } = input;

    logger.info(`Fetching performance metrics for wallet: ${walletAddress}`);

    // Validate wallet address
    validateSolanaAddress(walletAddress);

    // Create cache key
    const cacheKey = `performance:wallet:${walletAddress}`;

    // Try cache first
    const performance = await withCache(
      cacheKey,
      async () => {
        // Find user by wallet
        const user = await dbUtils.findUserByWallet(walletAddress);

        if (!user) {
          throw new DatabaseError(
            DatabaseErrorType.USER_NOT_FOUND,
            `No user found with wallet address: ${walletAddress}`,
            'This wallet address is not registered in the system'
          );
        }

        // Get all positions
        const dbPositions = await dbUtils.findPositionsByUserId(user.id, true);

        // Get aggregated stats
        const aggregatedStats = await dbUtils.getUserAggregatedStats(user.id);

        // Transform positions
        const activePositions: PositionInfo[] = [];
        const closedPositions: PositionInfo[] = [];

        dbPositions.forEach((position) => {
          const posInfo: PositionInfo = {
            id: position.id,
            positionId: position.positionId,
            poolAddress: position.poolAddress,
            zbtcAmount: decimalToNumber(position.zbtcAmount) ?? 0,
            solAmount: decimalToNumber(position.solAmount) ?? 0,
            entryPrice: decimalToNumber(position.entryPrice) ?? 0,
            entryBin: position.entryBin,
            isActive: position.isActive,
            createdAt: position.createdAt.toISOString(),
            lastChecked: position.lastChecked.toISOString(),
            zbtcReturned: decimalToNumber(position.zbtcReturned),
            solReturned: decimalToNumber(position.solReturned),
            exitPrice: decimalToNumber(position.exitPrice),
            exitBin: position.exitBin,
            closedAt: position.closedAt?.toISOString() ?? null,
            zbtcFees: decimalToNumber(position.zbtcFees),
            solFees: decimalToNumber(position.solFees),
            pnlUsd: decimalToNumber(position.pnlUsd),
            pnlPercent: decimalToNumber(position.pnlPercent),
          };

          if (position.isActive) {
            activePositions.push(posInfo);
          } else {
            closedPositions.push(posInfo);
          }
        });

        // Calculate performance metrics
        const positionsWithPnl = closedPositions.filter(
          (p) => p.pnlUsd !== null && p.pnlPercent !== null
        );

        const winningPositions = positionsWithPnl.filter((p) => p.pnlUsd! > 0);
        const winRate =
          positionsWithPnl.length > 0
            ? (winningPositions.length / positionsWithPnl.length) * 100
            : 0;

        const avgPnlPercent =
          positionsWithPnl.length > 0
            ? positionsWithPnl.reduce((sum, p) => sum + p.pnlPercent!, 0) / positionsWithPnl.length
            : 0;

        // Best and worst positions
        let bestPosition = null;
        let worstPosition = null;

        if (positionsWithPnl.length > 0) {
          const best = positionsWithPnl.reduce((max, p) =>
            p.pnlUsd! > (max.pnlUsd ?? 0) ? p : max
          );
          const worst = positionsWithPnl.reduce((min, p) =>
            p.pnlUsd! < (min.pnlUsd ?? 0) ? p : min
          );

          bestPosition = {
            pnlUsd: best.pnlUsd!,
            pnlPercent: best.pnlPercent!,
          };

          worstPosition = {
            pnlUsd: worst.pnlUsd!,
            pnlPercent: worst.pnlPercent!,
          };
        }

        // Assemble response
        const walletPerformance: WalletPerformance = {
          walletAddress,
          user: {
            id: user.id,
            username: user.username,
          },
          summary: {
            totalPositions: dbPositions.length,
            activePositions: activePositions.length,
            closedPositions: closedPositions.length,
            totalPnlUsd: decimalToNumber(aggregatedStats.stats?.totalPnlUsd) ?? 0,
            totalZbtcFees: decimalToNumber(aggregatedStats.stats?.totalZbtcFees) ?? 0,
            totalSolFees: decimalToNumber(aggregatedStats.stats?.totalSolFees) ?? 0,
            avgPositionSize: decimalToNumber(aggregatedStats.stats?.avgPositionSize) ?? 0,
            avgHoldTime: aggregatedStats.stats?.avgHoldTime ?? 0,
          },
          performance: {
            bestPosition,
            worstPosition,
            winRate,
            avgPnlPercent,
          },
          activePositions,
        };

        return walletPerformance;
      },
      60 // Cache for 60 seconds
    );

    logger.info(
      `Successfully fetched performance for ${performance.user.username || performance.user.id}: ${performance.summary.totalPositions} positions, ${performance.performance.winRate.toFixed(1)}% win rate`
    );

    return performance;
  }, 'get wallet performance');
}

/**
 * Formats wallet performance as human-readable string
 * @param performance - Wallet performance data
 * @returns Formatted string
 */
export function formatWalletPerformance(performance: WalletPerformance): string {
  const lines: string[] = [];

  lines.push('Wallet Performance Report');
  lines.push('='.repeat(70));
  lines.push('');

  lines.push('User:');
  lines.push(`  Wallet: ${performance.walletAddress}`);
  if (performance.user.username) {
    lines.push(`  Username: ${performance.user.username}`);
  }
  lines.push('');

  const summary = performance.summary;
  lines.push('Summary:');
  lines.push(`  Total Positions: ${summary.totalPositions}`);
  lines.push(`  Active: ${summary.activePositions} | Closed: ${summary.closedPositions}`);
  lines.push('');

  lines.push('Overall Performance:');
  const pnlSign = summary.totalPnlUsd >= 0 ? '+' : '';
  lines.push(
    `  Total PnL: ${pnlSign}$${summary.totalPnlUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  );
  lines.push('');

  lines.push('Fees Collected:');
  lines.push(`  zBTC: ${summary.totalZbtcFees.toFixed(8)} zBTC`);
  lines.push(`  SOL: ${summary.totalSolFees.toFixed(4)} SOL`);
  lines.push('');

  const perf = performance.performance;
  lines.push('Performance Metrics:');
  lines.push(`  Win Rate: ${perf.winRate.toFixed(1)}%`);
  lines.push(`  Avg PnL: ${perf.avgPnlPercent >= 0 ? '+' : ''}${perf.avgPnlPercent.toFixed(2)}%`);

  if (perf.bestPosition) {
    lines.push(
      `  Best Position: +$${perf.bestPosition.pnlUsd.toFixed(2)} (+${perf.bestPosition.pnlPercent.toFixed(2)}%)`
    );
  }

  if (perf.worstPosition) {
    lines.push(
      `  Worst Position: $${perf.worstPosition.pnlUsd.toFixed(2)} (${perf.worstPosition.pnlPercent.toFixed(2)}%)`
    );
  }
  lines.push('');

  lines.push('Averages:');
  lines.push(
    `  Position Size: $${summary.avgPositionSize.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  );
  const avgDays = Math.floor(summary.avgHoldTime / 86400);
  const avgHours = Math.floor((summary.avgHoldTime % 86400) / 3600);
  lines.push(`  Hold Time: ${avgDays}d ${avgHours}h`);
  lines.push('');

  if (performance.activePositions.length > 0) {
    lines.push('Active Positions:');
    lines.push('-'.repeat(70));

    performance.activePositions.forEach((pos, idx) => {
      lines.push(`\n${idx + 1}. ${pos.positionId.slice(0, 12)}...`);
      lines.push(
        `   Amount: ${pos.zbtcAmount.toFixed(8)} zBTC + ${pos.solAmount.toFixed(4)} SOL`
      );
      lines.push(`   Entry Price: $${pos.entryPrice.toFixed(2)}`);

      if (pos.zbtcFees !== null && pos.solFees !== null) {
        lines.push(
          `   Fees Earned: ${pos.zbtcFees.toFixed(8)} zBTC + ${pos.solFees.toFixed(4)} SOL`
        );
      }

      const holdingDays = Math.floor(
        (Date.now() - new Date(pos.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      lines.push(`   Holding: ${holdingDays} days`);
    });

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Formats error for tool response
 * @param error - The error
 * @returns Formatted error message
 */
export function formatPerformanceError(error: unknown): string {
  return `Failed to fetch wallet performance.\n\n${formatError(error)}\n\nPlease check the wallet address and try again.`;
}
