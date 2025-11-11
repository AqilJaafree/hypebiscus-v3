/**
 * Get Credit Balance Tool
 *
 * Retrieves the current credit balance for a wallet address.
 * Returns balance, total purchased, and total used.
 */

import { z } from 'zod';
import { creditsService } from '../services/creditsService.js';
import { logger } from '../config.js';

// Input schema
export const GetCreditBalanceSchema = z.object({
  walletAddress: z.string().describe('The Solana wallet address to check credits for'),
});

export type GetCreditBalanceInput = z.infer<typeof GetCreditBalanceSchema>;

// Result type
export interface GetCreditBalanceResult {
  balance: number;
  totalPurchased: number;
  totalUsed: number;
  message: string;
}

/**
 * Get credit balance for a wallet
 */
export async function getCreditBalance(
  input: GetCreditBalanceInput
): Promise<GetCreditBalanceResult> {
  try {
    logger.info('Getting credit balance', {
      walletAddress: input.walletAddress.slice(0, 8) + '...',
    });

    const balance = await creditsService.getBalance(input.walletAddress);

    return {
      balance: balance.balance,
      totalPurchased: balance.totalPurchased,
      totalUsed: balance.totalUsed,
      message: `Balance: ${balance.balance} credits (${balance.totalPurchased} purchased, ${balance.totalUsed} used)`,
    };
  } catch (error) {
    logger.error('Error getting credit balance:', error);
    throw new Error(`Failed to get credit balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
