/**
 * Use Credits Tool
 *
 * Deducts credits from user's balance for a reposition execution.
 * Internal tool used by the system after successful repositions.
 */

import { z } from 'zod';
import { creditsService } from '../services/creditsService.js';
import { logger } from '../config.js';

// Input schema
export const UseCreditsSchema = z.object({
  walletAddress: z.string().describe('The Solana wallet address using credits'),
  amount: z.number().positive().describe('Number of credits to deduct'),
  positionAddress: z.string().optional().describe('Optional position address (for reposition operations)'),
  description: z.string().optional().describe('Optional description of what the credits were used for'),
  relatedResourceId: z.string().optional().describe('Optional resource ID (for non-position operations like queries)'),
});

export type UseCreditsInput = z.infer<typeof UseCreditsSchema>;

// Result type
export interface UseCreditsResult {
  success: boolean;
  balance: number;
  totalPurchased: number;
  totalUsed: number;
  creditsUsed: number;
  message: string;
}

/**
 * Use credits for a reposition
 */
export async function useCredits(
  input: UseCreditsInput
): Promise<UseCreditsResult> {
  try {
    logger.info('Using credits', {
      walletAddress: input.walletAddress.slice(0, 8) + '...',
      amount: input.amount,
      positionAddress: input.positionAddress ? input.positionAddress.slice(0, 8) + '...' : 'N/A',
      relatedResourceId: input.relatedResourceId,
    });

    const result = await creditsService.useCredits({
      walletAddress: input.walletAddress,
      amount: input.amount,
      positionAddress: input.positionAddress,
      relatedResourceId: input.relatedResourceId || input.description,
      description: input.description || (input.positionAddress
        ? `Reposition for position ${input.positionAddress.slice(0, 8)}...`
        : 'General credit usage'),
    });

    return {
      success: true,
      balance: result.balance,
      totalPurchased: result.totalPurchased,
      totalUsed: result.totalUsed,
      creditsUsed: input.amount,
      message: `Successfully used ${input.amount} credit(s). Remaining balance: ${result.balance} credits.`,
    };
  } catch (error) {
    logger.error('Error using credits:', error);
    throw new Error(`Failed to use credits: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
