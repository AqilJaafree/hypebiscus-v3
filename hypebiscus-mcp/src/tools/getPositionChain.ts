// Get Position Chain Tool - Retrieves complete reposition history for a position
import { repositionService } from '../services/repositionService.js';
import { logger } from '../config.js';
import { ErrorType, HypebiscusMCPError } from './types.js';

export interface GetPositionChainInput {
  positionAddress: string;
}

/**
 * Gets the complete reposition chain for a position
 * @param input - Position to query
 * @returns Position chain with full history
 */
export async function getPositionChain(input: GetPositionChainInput) {
  try {
    logger.info(`Fetching position chain for: ${input.positionAddress}`);

    const chain = await repositionService.getPositionChain(input.positionAddress);

    if (!chain) {
      return {
        positionAddress: input.positionAddress,
        hasHistory: false,
        message: 'No reposition history found for this position',
      };
    }

    return {
      positionAddress: input.positionAddress,
      hasHistory: true,
      chain,
    };
  } catch (error) {
    if (error instanceof HypebiscusMCPError) {
      throw error;
    }
    logger.error('Error fetching position chain:', error);
    throw new HypebiscusMCPError(
      ErrorType.INTERNAL_ERROR,
      'Failed to retrieve position chain',
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * Formats position chain for display
 */
export function formatPositionChain(result: Awaited<ReturnType<typeof getPositionChain>>) {
  return JSON.stringify(result, null, 2);
}

/**
 * Formats error for display
 */
export function formatPositionChainError(error: unknown): string {
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
