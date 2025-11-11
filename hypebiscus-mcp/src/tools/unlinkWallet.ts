// Unlink Wallet Tool - Remove wallet link between platforms
import { PublicKey } from '@solana/web3.js';
import { prisma } from '../services/database.js';
import { logger } from '../config.js';
import { ErrorType, HypebiscusMCPError } from './types.js';
import type { UnlinkWalletInput } from '../types/wallet-linking.js';

export interface UnlinkWalletResult {
  success: boolean;
  message: string;
  unlinkedWallet?: string;
  unlinkedTelegramUser?: string;
}

/**
 * Removes the link between a Telegram account and website wallet
 * @param input - Wallet address OR Telegram user ID to unlink
 * @returns Unlink operation result
 */
export async function unlinkWallet(
  input: UnlinkWalletInput
): Promise<UnlinkWalletResult> {
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

    // Find user by wallet address
    if (input.walletAddress) {
      logger.info(`Unlinking wallet: ${input.walletAddress}`);

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
    }
    // Find user by Telegram ID
    else if (input.telegramUserId) {
      logger.info(`Unlinking Telegram user: ${input.telegramUserId}`);

      user = await prisma.users.findFirst({
        where: {
          telegramId: BigInt(input.telegramUserId),
        },
      });
    }

    // User not found
    if (!user) {
      throw new HypebiscusMCPError(
        ErrorType.NOT_FOUND,
        'User or wallet not found',
        'No linked account exists for the provided identifier'
      );
    }

    // User has no link
    if (!user.linkedWalletAddress) {
      return {
        success: false,
        message: 'No wallet link exists for this account',
        unlinkedTelegramUser: user.telegramId.toString(),
      };
    }

    const linkedWallet = user.linkedWalletAddress;
    const linkedTelegramId = user.telegramId.toString();

    // Remove link from user
    await prisma.users.update({
      where: {
        id: user.id,
      },
      data: {
        linkedWalletAddress: null,
        walletLinkToken: null,
        walletLinkExpiresAt: null,
      },
    });

    // Remove link from positions
    await prisma.positions.updateMany({
      where: {
        userId: user.id,
        linkedWalletAddress: linkedWallet,
      },
      data: {
        linkedWalletAddress: null,
      },
    });

    logger.info(
      `Successfully unlinked wallet ${linkedWallet} from Telegram user ${linkedTelegramId}`
    );

    return {
      success: true,
      message: 'Wallet successfully unlinked from Telegram account',
      unlinkedWallet: linkedWallet,
      unlinkedTelegramUser: linkedTelegramId,
    };
  } catch (error) {
    if (error instanceof HypebiscusMCPError) {
      throw error;
    }
    logger.error('Error unlinking wallet:', error);
    throw new HypebiscusMCPError(
      ErrorType.INTERNAL_ERROR,
      'Failed to unlink wallet',
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * Formats unlink wallet result for display
 */
export function formatUnlinkWallet(result: UnlinkWalletResult): string {
  return JSON.stringify(
    {
      success: result.success,
      message: result.message,
      ...(result.unlinkedWallet && { unlinkedWallet: result.unlinkedWallet }),
      ...(result.unlinkedTelegramUser && {
        unlinkedTelegramUser: result.unlinkedTelegramUser,
      }),
    },
    null,
    2
  );
}

/**
 * Formats error for display
 */
export function formatUnlinkWalletError(error: unknown): string {
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
