// Get Linked Account Tool - Check if user/wallet is linked across platforms
import { PublicKey } from '@solana/web3.js';
import { prisma } from '../services/database.js';
import { logger } from '../config.js';
import { ErrorType, HypebiscusMCPError } from './types.js';
import type {
  GetLinkedAccountInput,
  LinkedAccountInfo,
} from '../types/wallet-linking.js';

/**
 * Checks if a wallet or Telegram user has a cross-platform link
 * @param input - Wallet address OR Telegram user ID
 * @returns Linked account information if exists
 */
export async function getLinkedAccount(
  input: GetLinkedAccountInput
): Promise<LinkedAccountInfo> {
  try {
    // Must provide either walletAddress or telegramUserId
    if (!input.walletAddress && !input.telegramUserId) {
      throw new HypebiscusMCPError(
        ErrorType.VALIDATION_ERROR,
        'Must provide either walletAddress or telegramUserId',
        'At least one identifier is required'
      );
    }

    let user: Awaited<ReturnType<typeof prisma.users.findFirst>> | null = null;
    let querySource: 'website' | 'telegram' = 'website';

    // Query by wallet address
    if (input.walletAddress) {
      logger.info(`Checking linked account for wallet: ${input.walletAddress}`);

      // Validate wallet address
      let publicKey: PublicKey;
      try {
        publicKey = new PublicKey(input.walletAddress);
      } catch (error) {
        throw new HypebiscusMCPError(
          ErrorType.VALIDATION_ERROR,
          'Invalid wallet address',
          error instanceof Error ? error.message : String(error)
        );
      }

      user = await prisma.users.findFirst({
        where: {
          linkedWalletAddress: publicKey.toBase58(),
        },
      });
      querySource = 'website';
    }
    // Query by Telegram user ID
    else if (input.telegramUserId) {
      logger.info(
        `Checking linked account for Telegram user: ${input.telegramUserId}`
      );

      user = await prisma.users.findFirst({
        where: {
          telegramId: BigInt(input.telegramUserId),
        },
      });

      logger.info(
        `Query result: ${user ? `Found user ${user.id}, linkedWallet: ${user.linkedWalletAddress || 'null'}` : 'User not found'}`
      );

      querySource = 'telegram';
    }

    // No user found
    if (!user) {
      return {
        isLinked: false,
        source: querySource,
      };
    }

    // User found but no link
    if (!user.linkedWalletAddress) {
      return {
        isLinked: false,
        telegramUserId: user.telegramId.toString(),
        telegramUsername: user.username ?? undefined,
        source: querySource,
      };
    }

    // User has active link
    logger.info(
      `Found linked account: Telegram ${user.telegramId} (username: ${user.username || 'null'}) <-> Wallet ${user.linkedWalletAddress}`
    );

    return {
      isLinked: true,
      telegramUserId: user.telegramId.toString(),
      telegramUsername: user.username ?? undefined,
      walletAddress: user.linkedWalletAddress,
      linkedAt: user.createdAt, // Note: Using user creation date as linkedAt field doesn't exist yet
      source: querySource,
    };
  } catch (error) {
    if (error instanceof HypebiscusMCPError) {
      throw error;
    }
    logger.error('Error getting linked account:', error);
    throw new HypebiscusMCPError(
      ErrorType.INTERNAL_ERROR,
      'Failed to get linked account',
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * Formats linked account info for display
 */
export function formatGetLinkedAccount(result: LinkedAccountInfo): string {
  if (!result.isLinked) {
    return JSON.stringify(
      {
        isLinked: false,
        telegramUserId: result.telegramUserId,
        telegramUsername: result.telegramUsername,
        source: result.source,
        message:
          result.telegramUserId
            ? 'Telegram account has no linked wallet'
            : 'Wallet is not linked to any Telegram account',
      },
      null,
      2
    );
  }

  return JSON.stringify(
    {
      isLinked: true,
      linkedAccount: {
        telegramUserId: result.telegramUserId,
        telegramUsername: result.telegramUsername,
        walletAddress: result.walletAddress,
        linkedAt: result.linkedAt?.toISOString(),
      },
      source: result.source,
      message:
        'Accounts are linked. Auto-reposition can be enabled from either platform.',
    },
    null,
    2
  );
}

/**
 * Formats error for display
 */
export function formatGetLinkedAccountError(error: unknown): string {
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
