// Get Wallet Reposition Stats Tool - Retrieves reposition statistics for a wallet
import { repositionService } from '../services/repositionService.js';
import { logger } from '../config.js';
import { ErrorType, HypebiscusMCPError } from './types.js';

export interface GetWalletRepositionStatsInput {
  walletAddress: string;
}

/**
 * Gets reposition statistics for a wallet
 * @param input - Wallet to query
 * @returns Reposition statistics
 */
export async function getWalletRepositionStats(input: GetWalletRepositionStatsInput) {
  try {
    logger.info(`Fetching reposition stats for wallet: ${input.walletAddress}`);

    const stats = await repositionService.getWalletRepositionStats(input.walletAddress);

    return {
      walletAddress: input.walletAddress,
      ...stats,
    };
  } catch (error) {
    if (error instanceof HypebiscusMCPError) {
      throw error;
    }
    logger.error('Error fetching wallet reposition stats:', error);
    throw new HypebiscusMCPError(
      ErrorType.INTERNAL_ERROR,
      'Failed to retrieve wallet reposition statistics',
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * Formats reposition stats for display
 */
export function formatWalletRepositionStats(result: Awaited<ReturnType<typeof getWalletRepositionStats>>) {
  return JSON.stringify(result, null, 2);
}

/**
 * Formats error for display
 */
export function formatWalletRepositionStatsError(error: unknown): string {
  if (error instanceof HypebiscusMCPError) {
    return JSON.stringify(
      {
        error: error.type,
        message: error.message,
        details: error.details,
      },
      null,
      2
    );
  }

  return JSON.stringify(
    {
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
    },
    null,
    2
  );
}
