// Prepare Reposition Tool - Prepares unsigned transaction for repositioning
import { repositionService } from '../services/repositionService.js';
import { logger } from '../config.js';
import { ErrorType, HypebiscusMCPError } from './types.js';
import { RepositionInput } from '../types/reposition.js';

/**
 * Prepares an unsigned reposition transaction
 * SECURITY: This only prepares an unsigned transaction
 * The client wallet must sign the transaction
 * @param input - Reposition parameters
 * @returns Unsigned transaction and metadata
 */
export async function prepareReposition(input: RepositionInput) {
  try {
    logger.info(`Preparing reposition transaction for position: ${input.positionAddress}`);

    const unsignedTx = await repositionService.prepareRepositionTransaction(input);

    return unsignedTx;
  } catch (error) {
    if (error instanceof HypebiscusMCPError) {
      throw error;
    }
    logger.error('Error preparing reposition transaction:', error);
    throw new HypebiscusMCPError(
      ErrorType.INTERNAL_ERROR,
      'Failed to prepare reposition transaction',
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * Formats reposition transaction for display
 */
export function formatPrepareReposition(result: Awaited<ReturnType<typeof prepareReposition>>) {
  return JSON.stringify(result, null, 2);
}

/**
 * Formats error for display
 */
export function formatPrepareRepositionError(error: unknown): string {
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
