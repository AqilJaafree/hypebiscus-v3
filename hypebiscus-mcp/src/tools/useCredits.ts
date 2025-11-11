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
  positionAddress: z.string().describe('The position address this credit usage is for'),
  description: z.string().optional().describe('Optional description of what the credits were used for'),
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
      positionAddress: input.positionAddress.slice(0, 8) + '...',
    });

    const result = await creditsService.useCredits({
      walletAddress: input.walletAddress,
      amount: input.amount,
      positionAddress: input.positionAddress,
      description: input.description || `Reposition for position ${input.positionAddress.slice(0, 8)}...`,
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
