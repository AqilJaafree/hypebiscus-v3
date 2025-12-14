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

// Internal types
type DeletionStats = DeleteWalletCompletelyResult['deletedRecords'];

interface WalletInfo {
  success: boolean;
  walletAddress: string;
  userId?: string;
  message?: string;
}

/**
 * Main entry point: Completely delete a wallet and all associated data
 */
export async function deleteWalletCompletely(
  input: DeleteWalletCompletelyInput
): Promise<DeleteWalletCompletelyResult> {
  try {
    logger.info('Complete wallet deletion requested', {
      walletAddress: input.walletAddress?.slice(0, 8) + '...',
      telegramId: input.telegramId
    });

    // Step 1: Resolve wallet information
    const walletInfo = await resolveWalletInfo(input);

    if (!walletInfo.success) {
      return createFailureResult(walletInfo.message || 'Failed to resolve wallet');
    }

    logger.info('Wallet identified for deletion', {
      walletAddress: walletInfo.walletAddress.slice(0, 8) + '...'
    });

    // Step 2: Delete all associated data
    const deletedRecords = await deleteAllWalletData(
      walletInfo.walletAddress,
      walletInfo.userId
    );

    logger.info('Wallet completely deleted', {
      walletAddress: walletInfo.walletAddress.slice(0, 8) + '...'
    });

    return createSuccessResult(walletInfo.walletAddress, deletedRecords);
  } catch (error) {
    logger.error('Error deleting wallet completely:', error);
    throw new Error(`Failed to delete wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Resolve wallet information from input (either Telegram ID or wallet address)
 */
async function resolveWalletInfo(input: DeleteWalletCompletelyInput): Promise<WalletInfo> {
  if (input.telegramId) {
    return await resolveWalletFromTelegram(input.telegramId);
  } else {
    return await resolveWalletFromAddress(input.walletAddress!);
  }
}

/**
 * Resolve wallet address from Telegram ID
 */
async function resolveWalletFromTelegram(telegramId: string): Promise<WalletInfo> {
  const user = await prisma.users.findFirst({
    where: { telegramId: BigInt(telegramId) },
  });

  if (!user) {
    return { success: false, walletAddress: '', message: 'User not found' };
  }

  // Check for linked wallet first
  let walletAddress = user.linkedWalletAddress || '';

  // If no linked wallet, check for bot-generated wallet
  if (!walletAddress) {
    const botWallet = await prisma.wallets.findFirst({
      where: { userId: user.id, isActive: true },
    });
    if (botWallet) {
      walletAddress = botWallet.publicKey;
    }
  }

  if (!walletAddress) {
    return {
      success: false,
      walletAddress: '',
      message: 'No wallet found for this Telegram account'
    };
  }

  return { success: true, walletAddress, userId: user.id };
}

/**
 * Resolve wallet information from wallet address
 */
async function resolveWalletFromAddress(walletAddress: string): Promise<WalletInfo> {
  const user = await prisma.users.findFirst({
    where: { linkedWalletAddress: walletAddress },
  });

  return {
    success: true,
    walletAddress,
    userId: user?.id
  };
}

/**
 * Delete all data associated with a wallet
 * Executes deletions in correct order to respect foreign key constraints
 */
async function deleteAllWalletData(
  walletAddress: string,
  userId?: string
): Promise<DeletionStats> {
  const stats: DeletionStats = {
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

  // Execute deletions in correct order (respecting foreign key constraints)
  await deleteCreditTransactions(walletAddress, stats);
  await deleteCredits(walletAddress, stats);
  await deleteSubscriptions(walletAddress, stats);
  await deleteLinkTokens(walletAddress, stats);
  await deleteRepositionExecutions(walletAddress, stats);
  await deletePendingTransactions(walletAddress, stats);

  if (userId) {
    await unlinkPositions(userId, walletAddress, stats);
  }

  await deleteBotGeneratedWallet(walletAddress, stats);

  if (userId) {
    await unlinkUser(userId, stats);
  }

  return stats;
}

/**
 * Delete credit transactions for the wallet
 */
async function deleteCreditTransactions(
  walletAddress: string,
  stats: DeletionStats
): Promise<void> {
  try {
    const result = await prisma.credit_transactions.deleteMany({
      where: { walletAddress },
    });
    stats.creditTransactions = result.count;
    logger.info(`Deleted ${result.count} credit transactions`);
  } catch (error) {
    logger.warn('Failed to delete credit transactions:', error);
  }
}

/**
 * Delete credit records for the wallet
 */
async function deleteCredits(
  walletAddress: string,
  stats: DeletionStats
): Promise<void> {
  try {
    const result = await prisma.user_credits.deleteMany({
      where: { walletAddress },
    });
    stats.credits = result.count;
    logger.info(`Deleted ${result.count} credit records`);
  } catch (error) {
    logger.warn('Failed to delete credits:', error);
  }
}

/**
 * Delete subscription records for the wallet
 */
async function deleteSubscriptions(
  walletAddress: string,
  stats: DeletionStats
): Promise<void> {
  try {
    const result = await prisma.user_subscriptions.deleteMany({
      where: { walletAddress },
    });
    stats.subscriptions = result.count;
    logger.info(`Deleted ${result.count} subscriptions`);
  } catch (error) {
    logger.warn('Failed to delete subscriptions:', error);
  }
}

/**
 * Delete wallet link tokens
 */
async function deleteLinkTokens(
  walletAddress: string,
  stats: DeletionStats
): Promise<void> {
  try {
    const result = await prisma.wallet_link_tokens.deleteMany({
      where: { walletAddress },
    });
    stats.linkTokens = result.count;
    logger.info(`Deleted ${result.count} link tokens`);
  } catch (error) {
    logger.warn('Failed to delete link tokens:', error);
  }
}

/**
 * Delete reposition execution records
 */
async function deleteRepositionExecutions(
  walletAddress: string,
  stats: DeletionStats
): Promise<void> {
  try {
    const result = await prisma.reposition_executions.deleteMany({
      where: { walletAddress },
    });
    stats.repositionExecutions = result.count;
    logger.info(`Deleted ${result.count} reposition executions`);
  } catch (error) {
    logger.warn('Failed to delete reposition executions:', error);
  }
}

/**
 * Delete pending transaction records
 */
async function deletePendingTransactions(
  walletAddress: string,
  stats: DeletionStats
): Promise<void> {
  try {
    const result = await prisma.pending_transactions.deleteMany({
      where: { walletAddress },
    });
    stats.pendingTransactions = result.count;
    logger.info(`Deleted ${result.count} pending transactions`);
  } catch (error) {
    logger.warn('Failed to delete pending transactions:', error);
  }
}

/**
 * Unlink positions from the wallet
 */
async function unlinkPositions(
  userId: string,
  walletAddress: string,
  stats: DeletionStats
): Promise<void> {
  try {
    const result = await prisma.positions.updateMany({
      where: { userId, linkedWalletAddress: walletAddress },
      data: { linkedWalletAddress: null },
    });
    stats.positionLinks = result.count;
    logger.info(`Removed wallet link from ${result.count} positions`);
  } catch (error) {
    logger.warn('Failed to unlink positions:', error);
  }
}

/**
 * Delete bot-generated wallet (includes private key)
 */
async function deleteBotGeneratedWallet(
  walletAddress: string,
  stats: DeletionStats
): Promise<void> {
  try {
    const botWallet = await prisma.wallets.findFirst({
      where: { publicKey: walletAddress },
    });

    if (botWallet) {
      await prisma.wallets.delete({
        where: { id: botWallet.id },
      });
      stats.botGeneratedWallet = true;
      logger.info('Deleted bot-generated wallet with private key');
    }
  } catch (error) {
    logger.warn('Failed to delete bot-generated wallet:', error);
  }
}

/**
 * Unlink wallet from user profile
 */
async function unlinkUser(userId: string, stats: DeletionStats): Promise<void> {
  try {
    await prisma.users.update({
      where: { id: userId },
      data: {
        linkedWalletAddress: null,
        walletLinkToken: null,
        walletLinkExpiresAt: null,
      },
    });
    stats.userLink = true;
    logger.info('Removed wallet link from user');
  } catch (error) {
    logger.warn('Failed to unlink user:', error);
  }
}

/**
 * Create a failure result object
 */
function createFailureResult(message: string): DeleteWalletCompletelyResult {
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
    message,
  };
}

/**
 * Create a success result object
 */
function createSuccessResult(
  walletAddress: string,
  deletedRecords: DeletionStats
): DeleteWalletCompletelyResult {
  return {
    success: true,
    walletAddress,
    deletedRecords,
    message: `Wallet ${walletAddress.slice(0, 8)}... and all associated data have been completely deleted.`,
  };
}
