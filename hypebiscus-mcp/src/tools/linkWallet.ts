// Link Wallet Tool - Validate token and link Telegram user with website wallet
import { PublicKey } from '@solana/web3.js';
import { createHmac } from 'crypto';
import { prisma } from '../services/database.js';
import { config, logger } from '../config.js';
import { ErrorType, HypebiscusMCPError } from './types.js';
import type { LinkWalletInput, LinkedAccountInfo } from '../types/wallet-linking.js';

/**
 * Links a Telegram user account with a website wallet using a valid token
 * @param input - Token and Telegram user ID
 * @returns Linked account information
 */
export async function linkWallet(
  input: LinkWalletInput
): Promise<LinkedAccountInfo> {
  try {
    logger.info(`Linking wallet ${input.walletAddress} for Telegram user: ${input.telegramUserId}`);

    // Validate token format
    if (!input.token || input.token.length !== 64) {
      throw new HypebiscusMCPError(
        ErrorType.VALIDATION_ERROR,
        'Invalid token format',
        'Token must be a 64-character hex string'
      );
    }

    // Validate wallet address
    let publicKey: PublicKey;
    try {
      publicKey = new PublicKey(input.walletAddress);
    } catch (error) {
      throw new HypebiscusMCPError(
        ErrorType.VALIDATION_ERROR,
        'Invalid wallet address in token',
        error instanceof Error ? error.message : String(error)
      );
    }

    // Verify HMAC signature to prevent tampering
    if (input.signature) {
      const message = `${input.token}:${publicKey.toBase58()}:${input.expiresAt}`;
      const expectedSignature = createHmac('sha256', config.walletLinkSecret)
        .update(message)
        .digest('hex');

      if (input.signature !== expectedSignature) {
        throw new HypebiscusMCPError(
          ErrorType.VALIDATION_ERROR,
          'Invalid signature. QR code data may have been tampered with.',
          'Please generate a new link token from the website'
        );
      }
    } else {
      // Require signature for security
      throw new HypebiscusMCPError(
        ErrorType.VALIDATION_ERROR,
        'Missing signature in link request',
        'This link token is from an old version. Please generate a new one.'
      );
    }

    // Check token in database (server-side validation)
    const tokenRecord = await prisma.wallet_link_tokens.findFirst({
      where: {
        token: input.token,
        walletAddress: publicKey.toBase58(),
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
          linkedWalletAddress: publicKey.toBase58(),
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
          linkedWalletAddress: publicKey.toBase58(),
        },
      });
    });

    logger.info(
      `Successfully linked wallet ${publicKey.toBase58()} to Telegram user ${input.telegramUserId}`
    );

    return {
      isLinked: true,
      telegramUserId: telegramUser.telegramId.toString(),
      telegramUsername: telegramUser.username ?? undefined,
      walletAddress: publicKey.toBase58(),
      linkedAt: new Date(),
      source: 'telegram',
    };
  } catch (error) {
    if (error instanceof HypebiscusMCPError) {
      throw error;
    }
    logger.error('Error linking wallet:', error);
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
export function formatLinkWallet(result: LinkedAccountInfo): string {
  return JSON.stringify(
    {
      success: true,
      linkedAccount: {
        telegramUserId: result.telegramUserId,
        telegramUsername: result.telegramUsername,
        walletAddress: result.walletAddress,
        linkedAt: result.linkedAt?.toISOString(),
      },
      message: 'Accounts linked successfully! You can now enable auto-reposition from either platform.',
    },
    null,
    2
  );
}

/**
 * Formats error for display
 */
export function formatLinkWalletError(error: unknown): string {
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
