/**
 * Delete Wallet Completely Tool
 *
 * Completely removes a wallet and ALL associated data from the database.
 * This is a DESTRUCTIVE operation - use with caution!
 *
 * What gets deleted:
 * - Wallet link from user profile
 * - Wallet link from positions
 * - Credit balance
 * - Subscription records
 * - Transaction history
 * - Link tokens
 * - Reposition executions
 * - Pending transactions
 * - Bot-generated wallet private key (if exists)
 *
 * Input: { walletAddress: string } OR { telegramId: string }
 * Output: { success: boolean, deletedRecords: object }
 */

import { z } from 'zod';
import { prisma } from '../services/database.js';
import { logger } from '../config.js';

// Input validation schema
export const DeleteWalletCompletelySchema = z.object({
  walletAddress: z.string().optional().describe('Wallet address to delete'),
  telegramId: z.string().optional().describe('Telegram ID to delete wallet for'),
}).refine(
  (data) => data.walletAddress || data.telegramId,
  { message: 'Either walletAddress or telegramId must be provided' }
);

export type DeleteWalletCompletelyInput = z.infer<typeof DeleteWalletCompletelySchema>;

export interface DeleteWalletCompletelyResult {
  success: boolean;
  walletAddress: string;
  deletedRecords: {
    userLink: boolean;
    positionLinks: number;
    credits: number;
    subscriptions: number;
    creditTransactions: number;
    linkTokens: number;
    repositionExecutions: number;
    pendingTransactions: number;
    botGeneratedWallet: boolean;
  };
  message: string;
}

/**
 * Completely delete a wallet and all associated data
 */
export async function deleteWalletCompletely(
  input: DeleteWalletCompletelyInput
): Promise<DeleteWalletCompletelyResult> {
  try {
    logger.info('Complete wallet deletion requested', {
      walletAddress: input.walletAddress?.slice(0, 8) + '...',
      telegramId: input.telegramId
    });

    let walletAddress: string;
    let userId: string | undefined;

    // Step 1: Find the wallet and user
    if (input.telegramId) {
      const user = await prisma.users.findFirst({
        where: { telegramId: BigInt(input.telegramId) },
      });

      if (!user) {
        return {
          success: false,
          walletAddress: '',
          deletedRecords: {
            userLink: false,
            positionLinks: 0,
            credits: 0,
            subscriptions: 0,
            creditTransactions: 0,
            linkTokens: 0,
            repositionExecutions: 0,
            pendingTransactions: 0,
            botGeneratedWallet: false,
          },
          message: 'User not found',
        };
      }

      userId = user.id;

      // Check for linked wallet first
      walletAddress = user.linkedWalletAddress || '';

      // If no linked wallet, check for bot-generated wallet
      if (!walletAddress) {
        const botWallet = await prisma.wallets.findFirst({
          where: {
            userId: user.id,
            isActive: true
          },
        });

        if (botWallet) {
          walletAddress = botWallet.publicKey;
        }
      }

      if (!walletAddress) {
        return {
          success: false,
          walletAddress: '',
          deletedRecords: {
            userLink: false,
            positionLinks: 0,
            credits: 0,
            subscriptions: 0,
            creditTransactions: 0,
            linkTokens: 0,
            repositionExecutions: 0,
            pendingTransactions: 0,
            botGeneratedWallet: false,
          },
          message: 'No wallet found for this Telegram account',
        };
      }
    } else {
      walletAddress = input.walletAddress!;

      const user = await prisma.users.findFirst({
        where: { linkedWalletAddress: walletAddress },
      });

      userId = user?.id;
    }

    logger.info('Wallet identified for deletion', { walletAddress: walletAddress.slice(0, 8) + '...' });

    const deletedRecords = {
      userLink: false,
      positionLinks: 0,
      credits: 0,
      subscriptions: 0,
      creditTransactions: 0,
      linkTokens: 0,
      repositionExecutions: 0,
      pendingTransactions: 0,
      botGeneratedWallet: false,
    };

    // Step 2: Delete all associated data (order matters for foreign keys)

    // 2a. Delete credit transactions
    try {
      const result = await prisma.credit_transactions.deleteMany({
        where: { walletAddress: walletAddress },
      });
      deletedRecords.creditTransactions = result.count;
      logger.info(`Deleted ${result.count} credit transactions`);
    } catch (error) {
      logger.warn('Failed to delete credit transactions:', error);
    }

    // 2b. Delete credits
    try {
      const result = await prisma.user_credits.deleteMany({
        where: { walletAddress: walletAddress },
      });
      deletedRecords.credits = result.count;
      logger.info(`Deleted ${result.count} credit records`);
    } catch (error) {
      logger.warn('Failed to delete credits:', error);
    }

    // 2c. Delete subscriptions
    try {
      const result = await prisma.user_subscriptions.deleteMany({
        where: { walletAddress: walletAddress },
      });
      deletedRecords.subscriptions = result.count;
      logger.info(`Deleted ${result.count} subscriptions`);
    } catch (error) {
      logger.warn('Failed to delete subscriptions:', error);
    }

    // 2d. Delete link tokens
    try {
      const result = await prisma.wallet_link_tokens.deleteMany({
        where: { walletAddress: walletAddress },
      });
      deletedRecords.linkTokens = result.count;
      logger.info(`Deleted ${result.count} link tokens`);
    } catch (error) {
      logger.warn('Failed to delete link tokens:', error);
    }

    // 2e. Delete reposition executions
    try {
      const result = await prisma.reposition_executions.deleteMany({
        where: { walletAddress: walletAddress },
      });
      deletedRecords.repositionExecutions = result.count;
      logger.info(`Deleted ${result.count} reposition executions`);
    } catch (error) {
      logger.warn('Failed to delete reposition executions:', error);
    }

    // 2f. Delete pending transactions
    try {
      const result = await prisma.pending_transactions.deleteMany({
        where: { walletAddress: walletAddress },
      });
      deletedRecords.pendingTransactions = result.count;
      logger.info(`Deleted ${result.count} pending transactions`);
    } catch (error) {
      logger.warn('Failed to delete pending transactions:', error);
    }

    // 2g. Remove wallet link from positions
    if (userId) {
      try {
        const result = await prisma.positions.updateMany({
          where: {
            userId,
            linkedWalletAddress: walletAddress,
          },
          data: {
            linkedWalletAddress: null,
          },
        });
        deletedRecords.positionLinks = result.count;
        logger.info(`Removed wallet link from ${result.count} positions`);
      } catch (error) {
        logger.warn('Failed to unlink positions:', error);
      }
    }

    // 2h. Delete bot-generated wallet (if exists)
    try {
      const botWallet = await prisma.wallets.findFirst({
        where: { publicKey: walletAddress },
      });

      if (botWallet) {
        await prisma.wallets.delete({
          where: { id: botWallet.id },
        });
        deletedRecords.botGeneratedWallet = true;
        logger.info('Deleted bot-generated wallet with private key');
      }
    } catch (error) {
      logger.warn('Failed to delete bot-generated wallet:', error);
    }

    // 2i. Remove wallet link from user
    if (userId) {
      try {
        await prisma.users.update({
          where: { id: userId },
          data: {
            linkedWalletAddress: null,
            walletLinkToken: null,
            walletLinkExpiresAt: null,
          },
        });
        deletedRecords.userLink = true;
        logger.info('Removed wallet link from user');
      } catch (error) {
        logger.warn('Failed to unlink user:', error);
      }
    }

    logger.info('Wallet completely deleted', { walletAddress: walletAddress.slice(0, 8) + '...' });

    return {
      success: true,
      walletAddress,
      deletedRecords,
      message: `Wallet ${walletAddress.slice(0, 8)}... and all associated data have been completely deleted.`,
    };
  } catch (error) {
    logger.error('Error deleting wallet completely:', error);
    throw new Error(`Failed to delete wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
