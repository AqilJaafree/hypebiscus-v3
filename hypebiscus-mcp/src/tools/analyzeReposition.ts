// Analyze Reposition Tool - Determines if a position needs repositioning
import { repositionService } from '../services/repositionService.js';
import { logger } from '../config.js';
import { ErrorType, HypebiscusMCPError } from './types.js';

export interface AnalyzeRepositionInput {
  positionAddress: string;
  poolAddress?: string;
}

/**
 * Analyzes a position and provides reposition recommendation
 * @param input - Position to analyze
 * @returns Reposition recommendation
 */
export async function analyzeReposition(input: AnalyzeRepositionInput) {
  try {
    logger.info(`Analyzing reposition for position: ${input.positionAddress}`);

    const recommendation = await repositionService.analyzePosition(
      input.positionAddress,
      input.poolAddress
    );

    return recommendation;
  } catch (error) {
    if (error instanceof HypebiscusMCPError) {
      throw error;
    }
    logger.error('Error analyzing reposition:', error);
    throw new HypebiscusMCPError(
      ErrorType.INTERNAL_ERROR,
      'Failed to analyze position for repositioning',
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * Formats reposition analysis for display
 */
export function formatAnalyzeReposition(recommendation: Awaited<ReturnType<typeof analyzeReposition>>) {
  return JSON.stringify(recommendation, null, 2);
}

/**
 * Formats error for display
 */
export function formatAnalyzeRepositionError(error: unknown): string {
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
