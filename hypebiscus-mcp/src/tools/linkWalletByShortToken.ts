// Link Wallet By Short Token Tool - Link using 8-character code
import { prisma } from '../services/database.js';
import { logger } from '../config.js';
import { ErrorType, HypebiscusMCPError } from './types.js';
import type { LinkedAccountInfo } from '../types/wallet-linking.js';

export interface LinkWalletByShortTokenInput {
  shortToken: string; // 8-character code from website
  telegramUserId: string; // Telegram user ID to link
}

/**
 * Links a Telegram user account with a website wallet using a short token
 * @param input - Short token and Telegram user ID
 * @returns Linked account information
 */
export async function linkWalletByShortToken(
  input: LinkWalletByShortTokenInput
): Promise<LinkedAccountInfo> {
  try {
    logger.info(
      `Linking wallet by short token ${input.shortToken} for Telegram user: ${input.telegramUserId}`
    );

    // Validate short token format (8 characters, alphanumeric uppercase)
    const shortToken = input.shortToken.toUpperCase().trim();
    if (!shortToken || shortToken.length !== 8) {
      throw new HypebiscusMCPError(
        ErrorType.VALIDATION_ERROR,
        'Invalid short token format',
        'Short token must be exactly 8 characters'
      );
    }

    // Validate short token contains only allowed characters
    const validChars = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/;
    if (!validChars.test(shortToken)) {
      throw new HypebiscusMCPError(
        ErrorType.VALIDATION_ERROR,
        'Invalid short token format',
        'Short token contains invalid characters'
      );
    }

    // Check token in database (server-side validation)
    const tokenRecord = await prisma.wallet_link_tokens.findFirst({
      where: {
        shortToken: shortToken,
        used: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (!tokenRecord) {
      throw new HypebiscusMCPError(
        ErrorType.VALIDATION_ERROR,
        'Invalid, expired, or already used token',
        'Please generate a new link token from the website'
      );
    }

    // Find Telegram user
    const telegramUser = await prisma.users.findFirst({
      where: {
        telegramId: BigInt(input.telegramUserId),
      },
    });

    if (!telegramUser) {
      throw new HypebiscusMCPError(
        ErrorType.NOT_FOUND,
        'Telegram user not found',
        'User must be registered with Hypebiscus bot first'
      );
    }

    // Check if Telegram user already has a linked wallet
    if (telegramUser.linkedWalletAddress) {
      throw new HypebiscusMCPError(
        ErrorType.VALIDATION_ERROR,
        'Telegram account already linked to another wallet',
        'Please unlink the existing wallet first'
      );
    }

    // Check if wallet is already linked to another Telegram account
    const existingLink = await prisma.users.findFirst({
      where: {
        linkedWalletAddress: tokenRecord.walletAddress,
      },
    });

    if (existingLink) {
      throw new HypebiscusMCPError(
        ErrorType.VALIDATION_ERROR,
        'Wallet is already linked to another Telegram account',
        'Please unlink the existing connection first'
      );
    }

    // Use database transaction for atomicity
    await prisma.$transaction(async (tx) => {
      // Mark token as used (single-use enforcement)
      await tx.wallet_link_tokens.update({
        where: { id: tokenRecord.id },
        data: {
          used: true,
          usedAt: new Date(),
        },
      });

      // Create bidirectional link
      await tx.users.update({
        where: {
          id: telegramUser.id,
        },
        data: {
          linkedWalletAddress: tokenRecord.walletAddress,
          walletLinkToken: null, // Clear any old token
          walletLinkExpiresAt: null,
        },
      });

      // Tag all existing positions from this wallet address with linked account
      await tx.positions.updateMany({
        where: {
          userId: telegramUser.id,
          source: 'telegram',
        },
        data: {
          linkedWalletAddress: tokenRecord.walletAddress,
        },
      });
    });

    logger.info(
      `Successfully linked wallet ${tokenRecord.walletAddress} to Telegram user ${input.telegramUserId} using short token`
    );

    return {
      isLinked: true,
      telegramUserId: telegramUser.telegramId.toString(),
      telegramUsername: telegramUser.username ?? undefined,
      walletAddress: tokenRecord.walletAddress,
      linkedAt: new Date(),
      source: 'telegram',
    };
  } catch (error) {
    if (error instanceof HypebiscusMCPError) {
      throw error;
    }
    logger.error('Error linking wallet by short token:', error);
    throw new HypebiscusMCPError(
      ErrorType.INTERNAL_ERROR,
      'Failed to link wallet',
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * Formats link wallet result for display
 */
export function formatLinkWalletByShortToken(
  result: LinkedAccountInfo
): string {
  return JSON.stringify(
    {
      success: true,
      linkedAccount: {
        telegramUserId: result.telegramUserId,
        telegramUsername: result.telegramUsername,
        walletAddress: result.walletAddress,
        linkedAt: result.linkedAt?.toISOString(),
      },
      message:
        'Accounts linked successfully! You can now enable auto-reposition from either platform.',
    },
    null,
    2
  );
}

/**
 * Formats error for display
 */
export function formatLinkWalletByShortTokenError(error: unknown): string {
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
      message:
        error instanceof Error ? error.message : 'Unknown error occurred',
    },
    null,
    2
  );
}
