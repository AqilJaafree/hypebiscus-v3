// Tool: get_user_positions - Get all positions for a user
import { logger } from '../config.js';
import { dbUtils } from '../services/database.js';
import { validateSolanaAddress } from '../utils/validation.js';
import { withErrorHandling, formatError } from '../utils/errors.js';
import { withCache } from '../utils/cache.js';
import {
  GetUserPositionsInput,
  PositionInfo,
  decimalToNumber,
  DatabaseError,
  DatabaseErrorType,
} from '../types/database.js';

/**
 * Gets all positions for a user
 * @param input - User ID or wallet address, with optional filters
 * @returns Array of positions
 */
export async function getUserPositions(input: GetUserPositionsInput): Promise<PositionInfo[]> {
  return withErrorHandling(async () => {
    const { userId, walletAddress, includeInactive = false } = input;

    if (!userId && !walletAddress) {
      throw new DatabaseError(
        DatabaseErrorType.INVALID_INPUT,
        'Either userId or walletAddress must be provided',
        'Please provide at least one identifier'
      );
    }

    logger.info(
      `Fetching positions for ${userId ? `user ${userId}` : `wallet ${walletAddress}`} (includeInactive: ${includeInactive})`
    );

    // Create cache key
    const identifier = userId || walletAddress!;
    const cacheKey = `positions:${identifier}:${includeInactive}`;

    // Try cache first
    const positions = await withCache(
      cacheKey,
      async () => {
        let targetUserId = userId;

        // If wallet address provided, look up user ID
        if (walletAddress) {
          validateSolanaAddress(walletAddress);

          const user = await dbUtils.findUserByWallet(walletAddress);
          if (!user) {
            throw new DatabaseError(
              DatabaseErrorType.USER_NOT_FOUND,
              `No user found with wallet address: ${walletAddress}`,
              'This wallet address is not registered in the system'
            );
          }
          targetUserId = user.id;
        }

        if (!targetUserId) {
          throw new DatabaseError(
            DatabaseErrorType.INVALID_INPUT,
            'Unable to determine user ID',
            'Invalid input parameters'
          );
        }

        // Fetch positions
        const dbPositions = await dbUtils.findPositionsByUserId(targetUserId, includeInactive);

        // Transform to output format
        const positionInfos: PositionInfo[] = dbPositions.map((position) => ({
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
        }));

        return positionInfos;
      },
      60 // Cache for 60 seconds
    );

    logger.info(
      `Successfully fetched ${positions.length} positions (${positions.filter((p) => p.isActive).length} active)`
    );

    return positions;
  }, 'get user positions');
}

/**
 * Formats positions as human-readable string
 * @param positions - Array of positions
 * @returns Formatted string
 */
export function formatPositions(positions: PositionInfo[]): string {
  const lines: string[] = [];

  lines.push('User Positions');
  lines.push('='.repeat(70));
  lines.push('');

  if (positions.length === 0) {
    lines.push('No positions found.');
    return lines.join('\n');
  }

  const activePositions = positions.filter((p) => p.isActive);
  const closedPositions = positions.filter((p) => !p.isActive);

  lines.push(`Total Positions: ${positions.length}`);
  lines.push(`Active: ${activePositions.length} | Closed: ${closedPositions.length}`);
  lines.push('');

  // Display active positions
  if (activePositions.length > 0) {
    lines.push('ACTIVE POSITIONS:');
    lines.push('-'.repeat(70));

    activePositions.forEach((pos, idx) => {
      lines.push(`\n${idx + 1}. Position ID: ${pos.positionId}`);
      lines.push(`   Pool: ${pos.poolAddress.slice(0, 8)}...${pos.poolAddress.slice(-6)}`);
      lines.push(`   Entry: ${pos.zbtcAmount.toFixed(8)} zBTC + ${pos.solAmount.toFixed(4)} SOL`);
      lines.push(`   Entry Price: $${pos.entryPrice.toFixed(2)} (Bin: ${pos.entryBin})`);

      if (pos.zbtcFees !== null && pos.solFees !== null) {
        lines.push(`   Fees Earned: ${pos.zbtcFees.toFixed(8)} zBTC + ${pos.solFees.toFixed(4)} SOL`);
      }

      const holdingDays = Math.floor(
        (Date.now() - new Date(pos.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      lines.push(`   Holding: ${holdingDays} days (since ${new Date(pos.createdAt).toLocaleDateString()})`);
    });

    lines.push('');
  }

  // Display closed positions
  if (closedPositions.length > 0) {
    lines.push('CLOSED POSITIONS:');
    lines.push('-'.repeat(70));

    closedPositions.forEach((pos, idx) => {
      lines.push(`\n${idx + 1}. Position ID: ${pos.positionId}`);
      lines.push(`   Pool: ${pos.poolAddress.slice(0, 8)}...${pos.poolAddress.slice(-6)}`);
      lines.push(
        `   Entry: ${pos.zbtcAmount.toFixed(8)} zBTC + ${pos.solAmount.toFixed(4)} SOL @ $${pos.entryPrice.toFixed(2)}`
      );

      if (pos.exitPrice !== null) {
        lines.push(`   Exit Price: $${pos.exitPrice.toFixed(2)} (Bin: ${pos.exitBin ?? 'N/A'})`);
      }

      if (pos.zbtcReturned !== null && pos.solReturned !== null) {
        lines.push(
          `   Returned: ${pos.zbtcReturned.toFixed(8)} zBTC + ${pos.solReturned.toFixed(4)} SOL`
        );
      }

      if (pos.zbtcFees !== null && pos.solFees !== null) {
        lines.push(`   Fees Earned: ${pos.zbtcFees.toFixed(8)} zBTC + ${pos.solFees.toFixed(4)} SOL`);
      }

      if (pos.pnlUsd !== null && pos.pnlPercent !== null) {
        const pnlSign = pos.pnlUsd >= 0 ? '+' : '';
        lines.push(
          `   PnL: ${pnlSign}$${pos.pnlUsd.toFixed(2)} (${pnlSign}${pos.pnlPercent.toFixed(2)}%)`
        );
      }

      if (pos.closedAt) {
        const holdingPeriod = Math.floor(
          (new Date(pos.closedAt).getTime() - new Date(pos.createdAt).getTime()) /
            (1000 * 60 * 60 * 24)
        );
        lines.push(`   Held: ${holdingPeriod} days`);
        lines.push(`   Closed: ${new Date(pos.closedAt).toLocaleDateString()}`);
      }
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
export function formatPositionsError(error: unknown): string {
  return `Failed to fetch user positions.\n\n${formatError(error)}\n\nPlease check the input parameters and try again.`;
}
