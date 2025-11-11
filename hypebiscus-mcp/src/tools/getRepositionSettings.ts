// Get Reposition Settings Tool - Fetch user's auto-reposition settings
import { PublicKey } from '@solana/web3.js';
import { prisma } from '../services/database.js';
import { logger } from '../config.js';
import { ErrorType, HypebiscusMCPError } from './types.js';
import type {
  GetRepositionSettingsInput,
  RepositionSettings,
  UrgencyThreshold,
  RepositionStrategy,
} from '../types/wallet-linking.js';

/**
 * Gets or creates default reposition settings for a user
 * @param input - Wallet address OR Telegram user ID
 * @returns User's reposition settings
 */
export async function getRepositionSettings(
  input: GetRepositionSettingsInput
): Promise<RepositionSettings> {
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
      logger.info(
        `Getting reposition settings for wallet: ${input.walletAddress}`
      );

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

      // For website users, find by linked wallet address
      user = await prisma.users.findFirst({
        where: {
          linkedWalletAddress: publicKey.toBase58(),
        },
      });
    }
    // Find user by Telegram ID
    else if (input.telegramUserId) {
      logger.info(
        `Getting reposition settings for Telegram user: ${input.telegramUserId}`
      );

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
        'User not found',
        'No user exists for the provided identifier'
      );
    }

    // Fetch settings for this user
    const existingSettings = await prisma.user_reposition_settings.findUnique({
      where: {
        userId: user.id,
      },
    });

    // If settings exist, return them
    if (existingSettings) {
      logger.info(`Found existing settings for user ${user.id}`);

      return {
        userId: existingSettings.userId,
        autoRepositionEnabled: existingSettings.autoRepositionEnabled,
        urgencyThreshold: existingSettings.urgencyThreshold as UrgencyThreshold,
        maxGasCostSol: existingSettings.maxGasCostSol.toNumber(),
        minFeesToCollectUsd: existingSettings.minFeesToCollectUsd.toNumber(),
        allowedStrategies: existingSettings.allowedStrategies as RepositionStrategy[],
        telegramNotifications: existingSettings.telegramNotifications,
        websiteNotifications: existingSettings.websiteNotifications,
        updatedFrom: existingSettings.updatedFrom as 'telegram' | 'website' | undefined,
        updatedAt: existingSettings.updatedAt,
        createdAt: existingSettings.createdAt,
      };
    }

    // Create default settings
    logger.info(`Creating default settings for user ${user.id}`);

    const defaultSettings = await prisma.user_reposition_settings.create({
      data: {
        userId: user.id,
        autoRepositionEnabled: false,
        urgencyThreshold: 'medium',
        maxGasCostSol: 0.02,
        minFeesToCollectUsd: 5,
        allowedStrategies: ['one-sided-x', 'one-sided-y', 'balanced'],
        telegramNotifications: true,
        websiteNotifications: true,
      },
    });

    return {
      userId: defaultSettings.userId,
      autoRepositionEnabled: defaultSettings.autoRepositionEnabled,
      urgencyThreshold: defaultSettings.urgencyThreshold as UrgencyThreshold,
      maxGasCostSol: defaultSettings.maxGasCostSol.toNumber(),
      minFeesToCollectUsd: defaultSettings.minFeesToCollectUsd.toNumber(),
      allowedStrategies: defaultSettings.allowedStrategies as RepositionStrategy[],
      telegramNotifications: defaultSettings.telegramNotifications,
      websiteNotifications: defaultSettings.websiteNotifications,
      updatedFrom: defaultSettings.updatedFrom as 'telegram' | 'website' | undefined,
      updatedAt: defaultSettings.updatedAt,
      createdAt: defaultSettings.createdAt,
    };
  } catch (error) {
    if (error instanceof HypebiscusMCPError) {
      throw error;
    }
    logger.error('Error getting reposition settings:', error);
    throw new HypebiscusMCPError(
      ErrorType.INTERNAL_ERROR,
      'Failed to get reposition settings',
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * Formats reposition settings for display
 */
export function formatGetRepositionSettings(
  settings: RepositionSettings
): string {
  return JSON.stringify(
    {
      autoRepositionEnabled: settings.autoRepositionEnabled,
      urgencyThreshold: settings.urgencyThreshold,
      maxGasCostSol: settings.maxGasCostSol,
      minFeesToCollectUsd: settings.minFeesToCollectUsd,
      allowedStrategies: settings.allowedStrategies,
      telegramNotifications: settings.telegramNotifications,
      websiteNotifications: settings.websiteNotifications,
      updatedFrom: settings.updatedFrom ?? 'default',
      updatedAt: settings.updatedAt.toISOString(),
      message: settings.autoRepositionEnabled
        ? 'Auto-reposition is ENABLED'
        : 'Auto-reposition is DISABLED',
    },
    null,
    2
  );
}

/**
 * Formats error for display
 */
export function formatGetRepositionSettingsError(error: unknown): string {
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
