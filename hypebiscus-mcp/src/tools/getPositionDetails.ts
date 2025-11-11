// Tool: get_position_details - Get detailed info about a specific position
import { logger } from '../config.js';
import { dbUtils } from '../services/database.js';
import { meteoraApi } from '../services/meteoraApi.js';
import { withErrorHandling, formatError } from '../utils/errors.js';
import { withCache } from '../utils/cache.js';
import {
  GetPositionDetailsInput,
  PositionDetails,
  decimalToNumber,
  DatabaseError,
  DatabaseErrorType,
} from '../types/database.js';

/**
 * Gets detailed information about a specific position
 * Combines database data with live pool metrics
 * @param input - Position ID
 * @returns Position details with pool metrics
 */
export async function getPositionDetails(
  input: GetPositionDetailsInput
): Promise<PositionDetails> {
  return withErrorHandling(async () => {
    const { positionId } = input;

    logger.info(`Fetching position details for: ${positionId}`);

    // Create cache key
    const cacheKey = `position:details:${positionId}`;

    // Try cache first (shorter TTL for position details since they include live data)
    const details = await withCache(
      cacheKey,
      async () => {
        // Find position in database
        const position = await dbUtils.findPositionById(positionId);

        if (!position) {
          throw new DatabaseError(
            DatabaseErrorType.POSITION_NOT_FOUND,
            `Position not found: ${positionId}`,
            'This position does not exist in the system'
          );
        }

        // Fetch current pool metrics
        logger.debug(`Fetching live pool data for ${position.poolAddress}`);
        const poolData = await meteoraApi.getPoolData(position.poolAddress);

        // Calculate holding period
        const createdTime = new Date(position.createdAt).getTime();
        const endTime = position.closedAt
          ? new Date(position.closedAt).getTime()
          : Date.now();
        const holdingPeriodSeconds = Math.floor((endTime - createdTime) / 1000);
        const holdingPeriodDays = holdingPeriodSeconds / 86400;

        // Build position details
        const positionDetails: PositionDetails = {
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
          user: {
            id: position.users.id,
            username: position.users.username,
            walletAddress: position.users.wallets?.publicKey ?? 'Unknown',
          },
          poolMetrics: {
            poolName: poolData.name,
            currentPrice: poolData.current_price,
            apy: poolData.apy,
            volume24h: poolData.trade_volume_24h,
            fees24h: poolData.fees_24h,
            liquidity: parseFloat(poolData.liquidity),
          },
          performance: {
            holdingPeriodDays,
          },
        };

        // Calculate unrealized PnL for active positions
        if (position.isActive && poolData.current_price) {
          const currentPrice = poolData.current_price;
          const entryPrice = decimalToNumber(position.entryPrice) ?? 0;
          const zbtcAmount = decimalToNumber(position.zbtcAmount) ?? 0;
          const solAmount = decimalToNumber(position.solAmount) ?? 0;

          // Simple unrealized PnL calculation
          // This is a rough estimate - actual PnL depends on bin distribution and IL
          const entryValueUsd = zbtcAmount * entryPrice + solAmount * (entryPrice / 1000); // Rough SOL value
          const currentValueUsd = zbtcAmount * currentPrice + solAmount * (currentPrice / 1000);

          const unrealizedPnlUsd = currentValueUsd - entryValueUsd;
          const unrealizedPnlPercent =
            entryValueUsd > 0 ? (unrealizedPnlUsd / entryValueUsd) * 100 : 0;

          // Add fees to unrealized gains
          const feesUsd =
            ((decimalToNumber(position.zbtcFees) ?? 0) * currentPrice) +
            ((decimalToNumber(position.solFees) ?? 0) * (currentPrice / 1000));

          positionDetails.performance.unrealizedPnl = {
            zbtc: 0, // Simplified - actual calculation requires current bin distribution
            sol: 0,
            usd: unrealizedPnlUsd + feesUsd,
            percent: unrealizedPnlPercent,
          };
        }

        // Add realized PnL for closed positions
        if (!position.isActive && position.pnlUsd !== null && position.pnlPercent !== null) {
          const zbtcReturned = decimalToNumber(position.zbtcReturned) ?? 0;
          const solReturned = decimalToNumber(position.solReturned) ?? 0;
          const zbtcAmount = decimalToNumber(position.zbtcAmount) ?? 0;
          const solAmount = decimalToNumber(position.solAmount) ?? 0;

          positionDetails.performance.realizedPnl = {
            zbtc: zbtcReturned - zbtcAmount,
            sol: solReturned - solAmount,
            usd: decimalToNumber(position.pnlUsd) ?? 0,
            percent: decimalToNumber(position.pnlPercent) ?? 0,
          };
        }

        return positionDetails;
      },
      30 // Shorter cache (30 seconds) for position details with live data
    );

    logger.info(
      `Successfully fetched details for position ${positionId} (${details.isActive ? 'active' : 'closed'})`
    );

    return details;
  }, 'get position details');
}

/**
 * Formats position details as human-readable string
 * @param details - Position details
 * @returns Formatted string
 */
export function formatPositionDetails(details: PositionDetails): string {
  const lines: string[] = [];

  lines.push('Position Details');
  lines.push('='.repeat(70));
  lines.push('');

  lines.push('Position:');
  lines.push(`  ID: ${details.positionId}`);
  lines.push(`  Status: ${details.isActive ? 'ACTIVE' : 'CLOSED'}`);
  lines.push('');

  lines.push('User:');
  if (details.user.username) {
    lines.push(`  Username: ${details.user.username}`);
  }
  lines.push(`  Wallet: ${details.user.walletAddress}`);
  lines.push('');

  lines.push('Pool:');
  lines.push(`  Name: ${details.poolMetrics.poolName}`);
  lines.push(`  Address: ${details.poolAddress}`);
  lines.push(`  Current Price: $${details.poolMetrics.currentPrice.toFixed(2)}`);
  lines.push(`  APY: ${details.poolMetrics.apy.toFixed(2)}%`);
  lines.push(
    `  24h Volume: $${details.poolMetrics.volume24h.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  );
  lines.push(
    `  24h Fees: $${details.poolMetrics.fees24h.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  );
  lines.push('');

  lines.push('Position Entry:');
  lines.push(`  zBTC: ${details.zbtcAmount.toFixed(8)} zBTC`);
  lines.push(`  SOL: ${details.solAmount.toFixed(4)} SOL`);
  lines.push(`  Entry Price: $${details.entryPrice.toFixed(2)}`);
  lines.push(`  Entry Bin: ${details.entryBin}`);
  lines.push(`  Opened: ${new Date(details.createdAt).toLocaleString()}`);
  lines.push('');

  if (details.zbtcFees !== null && details.solFees !== null) {
    lines.push('Fees Collected:');
    lines.push(`  zBTC: ${details.zbtcFees.toFixed(8)} zBTC`);
    lines.push(`  SOL: ${details.solFees.toFixed(4)} SOL`);
    lines.push('');
  }

  if (details.isActive && details.performance.unrealizedPnl) {
    const unrealized = details.performance.unrealizedPnl;
    const sign = unrealized.usd >= 0 ? '+' : '';

    lines.push('Unrealized Performance:');
    lines.push(`  PnL: ${sign}$${unrealized.usd.toFixed(2)} (${sign}${unrealized.percent.toFixed(2)}%)`);
    lines.push(
      `  Holding Period: ${details.performance.holdingPeriodDays.toFixed(1)} days`
    );
    lines.push('');
  }

  if (!details.isActive) {
    lines.push('Position Exit:');
    if (details.exitPrice !== null) {
      lines.push(`  Exit Price: $${details.exitPrice.toFixed(2)}`);
      lines.push(`  Exit Bin: ${details.exitBin ?? 'N/A'}`);
    }

    if (details.zbtcReturned !== null && details.solReturned !== null) {
      lines.push(`  zBTC Returned: ${details.zbtcReturned.toFixed(8)} zBTC`);
      lines.push(`  SOL Returned: ${details.solReturned.toFixed(4)} SOL`);
    }

    if (details.closedAt) {
      lines.push(`  Closed: ${new Date(details.closedAt).toLocaleString()}`);
    }
    lines.push('');

    if (details.performance.realizedPnl) {
      const realized = details.performance.realizedPnl;
      const sign = realized.usd >= 0 ? '+' : '';

      lines.push('Realized Performance:');
      lines.push(`  PnL: ${sign}$${realized.usd.toFixed(2)} (${sign}${realized.percent.toFixed(2)}%)`);
      lines.push(`  zBTC Change: ${realized.zbtc >= 0 ? '+' : ''}${realized.zbtc.toFixed(8)} zBTC`);
      lines.push(`  SOL Change: ${realized.sol >= 0 ? '+' : ''}${realized.sol.toFixed(4)} SOL`);
      lines.push(
        `  Holding Period: ${details.performance.holdingPeriodDays.toFixed(1)} days`
      );
      lines.push('');
    }
  }

  lines.push(`Last Checked: ${new Date(details.lastChecked).toLocaleString()}`);

  return lines.join('\n');
}

/**
 * Formats error for tool response
 * @param error - The error
 * @returns Formatted error message
 */
export function formatPositionDetailsError(error: unknown): string {
  return `Failed to fetch position details.\n\n${formatError(error)}\n\nPlease check the position ID and try again.`;
}
