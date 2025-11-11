/**
 * Record Execution Tool
 *
 * Records a reposition execution for usage tracking and analytics.
 * Used by Garden bot to log auto-reposition executions.
 *
 * Input: {
 *   walletAddress: string
 *   positionAddress: string
 *   success: boolean
 *   gasCostSol?: number
 *   feesCollectedUsd?: number
 *   error?: string
 *   transactionSignature?: string
 *   executionMode?: 'auto' | 'manual'
 * }
 *
 * Output: { success: boolean, executionId: string, message: string }
 */

import { z } from 'zod';
import { subscriptionService } from '../services/subscriptionService.js';
import { logger } from '../config.js';

// Input validation schema
export const RecordExecutionSchema = z.object({
  walletAddress: z.string().min(32).max(44).describe('Solana wallet address'),
  positionAddress: z.string().min(32).max(44).describe('Position address'),
  success: z.boolean().describe('Whether the reposition was successful'),
  gasCostSol: z.number().optional().describe('Gas cost in SOL'),
  feesCollectedUsd: z.number().optional().describe('Fees collected in USD'),
  error: z.string().optional().describe('Error message if failed'),
  transactionSignature: z.string().optional().describe('Transaction signature'),
  executionMode: z.enum(['auto', 'manual']).default('auto').describe('Execution mode'),
});

export type RecordExecutionInput = z.infer<typeof RecordExecutionSchema>;

export interface RecordExecutionResult {
  success: boolean;
  executionId?: string;
  message: string;
}

/**
 * Record a reposition execution for tracking
 */
export async function recordExecution(
  input: RecordExecutionInput
): Promise<RecordExecutionResult> {
  try {
    logger.info('Recording reposition execution', {
      walletAddress: input.walletAddress.slice(0, 8) + '...',
      positionAddress: input.positionAddress.slice(0, 8) + '...',
      success: input.success,
      executionMode: input.executionMode,
    });

    // Record execution
    await subscriptionService.recordRepositionExecution({
      walletAddress: input.walletAddress,
      positionAddress: input.positionAddress,
      success: input.success,
      gasCostSol: input.gasCostSol,
      feesCollectedUsd: input.feesCollectedUsd,
      error: input.error,
      transactionSignature: input.transactionSignature,
      executionMode: input.executionMode,
    });

    logger.info('Execution recorded successfully', {
      walletAddress: input.walletAddress.slice(0, 8) + '...',
    });

    return {
      success: true,
      message: `Execution recorded successfully for position ${input.positionAddress.slice(0, 8)}...`,
    };
  } catch (error) {
    logger.error('Error recording execution:', error);

    return {
      success: false,
      message: `Error recording execution: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
