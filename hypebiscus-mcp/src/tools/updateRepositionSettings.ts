// Update Reposition Settings Tool - Update user's settings from either platform
import { PublicKey } from '@solana/web3.js';
import { prisma } from '../services/database.js';
import { logger } from '../config.js';
import { ErrorType, HypebiscusMCPError } from './types.js';
import type {
  UpdateRepositionSettingsInput,
  RepositionSettings,
  UrgencyThreshold,
  RepositionStrategy,
} from '../types/wallet-linking.js';

/**
 * Updates user's auto-reposition settings
 * @param input - Settings to update and user identifier
 * @returns Updated settings
 */
export async function updateRepositionSettings(
  input: UpdateRepositionSettingsInput
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

    // Validate settings values
    if (input.settings.urgencyThreshold) {
      const validThresholds: UrgencyThreshold[] = ['low', 'medium', 'high'];
      if (!validThresholds.includes(input.settings.urgencyThreshold)) {
        throw new HypebiscusMCPError(
          ErrorType.VALIDATION_ERROR,
          'Invalid urgency threshold',
          'Must be one of: low, medium, high'
        );
      }
    }

    if (input.settings.maxGasCostSol !== undefined) {
      if (input.settings.maxGasCostSol < 0 || input.settings.maxGasCostSol > 1) {
        throw new HypebiscusMCPError(
          ErrorType.VALIDATION_ERROR,
          'Invalid max gas cost',
          'Must be between 0 and 1 SOL'
        );
      }
    }

    if (input.settings.minFeesToCollectUsd !== undefined) {
      if (input.settings.minFeesToCollectUsd < 0) {
        throw new HypebiscusMCPError(
          ErrorType.VALIDATION_ERROR,
          'Invalid minimum fees',
          'Must be greater than or equal to 0'
        );
      }
    }

    if (input.settings.allowedStrategies) {
      const validStrategies: RepositionStrategy[] = [
        'one-sided-x',
        'one-sided-y',
        'balanced',
      ];
      const invalidStrategies = input.settings.allowedStrategies.filter(
        (s) => !validStrategies.includes(s)
      );
      if (invalidStrategies.length > 0) {
        throw new HypebiscusMCPError(
          ErrorType.VALIDATION_ERROR,
          'Invalid reposition strategy',
          `Invalid strategies: ${invalidStrategies.join(', ')}`
        );
      }
      if (input.settings.allowedStrategies.length === 0) {
        throw new HypebiscusMCPError(
          ErrorType.VALIDATION_ERROR,
          'Must allow at least one strategy',
          'Cannot disable all reposition strategies'
        );
      }
    }

    let user: Awaited<ReturnType<typeof prisma.users.findFirst>> | null = null;

    // Find user by wallet address
    if (input.walletAddress) {
      logger.info(
        `Updating reposition settings for wallet: ${input.walletAddress}`
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

      user = await prisma.users.findFirst({
        where: {
          linkedWalletAddress: publicKey.toBase58(),
        },
      });
    }
    // Find user by Telegram ID
    else if (input.telegramUserId) {
      logger.info(
        `Updating reposition settings for Telegram user: ${input.telegramUserId}`
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

    // Prepare update data
    const updateData: Record<string, string | number | boolean | string[]> = {
      updatedFrom: input.updatedFrom,
    };

    if (input.settings.autoRepositionEnabled !== undefined) {
      updateData.autoRepositionEnabled = input.settings.autoRepositionEnabled;
    }
    if (input.settings.urgencyThreshold) {
      updateData.urgencyThreshold = input.settings.urgencyThreshold;
    }
    if (input.settings.maxGasCostSol !== undefined) {
      updateData.maxGasCostSol = input.settings.maxGasCostSol;
    }
    if (input.settings.minFeesToCollectUsd !== undefined) {
      updateData.minFeesToCollectUsd = input.settings.minFeesToCollectUsd;
    }
    if (input.settings.allowedStrategies) {
      updateData.allowedStrategies = input.settings.allowedStrategies;
    }
    if (input.settings.telegramNotifications !== undefined) {
      updateData.telegramNotifications = input.settings.telegramNotifications;
    }
    if (input.settings.websiteNotifications !== undefined) {
      updateData.websiteNotifications = input.settings.websiteNotifications;
    }

    // Upsert settings (create if doesn't exist, update if exists)
    const updatedSettings = await prisma.user_reposition_settings.upsert({
      where: {
        userId: user.id,
      },
      create: {
        userId: user.id,
        autoRepositionEnabled: input.settings.autoRepositionEnabled ?? false,
        urgencyThreshold: input.settings.urgencyThreshold ?? 'medium',
        maxGasCostSol: input.settings.maxGasCostSol ?? 0.02,
        minFeesToCollectUsd: input.settings.minFeesToCollectUsd ?? 5,
        allowedStrategies: input.settings.allowedStrategies ?? [
          'one-sided-x',
          'one-sided-y',
          'balanced',
        ],
        telegramNotifications: input.settings.telegramNotifications ?? true,
        websiteNotifications: input.settings.websiteNotifications ?? true,
        updatedFrom: input.updatedFrom,
      },
      update: updateData,
    });

    logger.info(
      `Successfully updated settings for user ${user.id} (from ${input.updatedFrom})`
    );

    return {
      userId: updatedSettings.userId,
      autoRepositionEnabled: updatedSettings.autoRepositionEnabled,
      urgencyThreshold: updatedSettings.urgencyThreshold as UrgencyThreshold,
      maxGasCostSol: updatedSettings.maxGasCostSol.toNumber(),
      minFeesToCollectUsd: updatedSettings.minFeesToCollectUsd.toNumber(),
      allowedStrategies: updatedSettings.allowedStrategies as RepositionStrategy[],
      telegramNotifications: updatedSettings.telegramNotifications,
      websiteNotifications: updatedSettings.websiteNotifications,
      updatedFrom: updatedSettings.updatedFrom as 'telegram' | 'website' | undefined,
      updatedAt: updatedSettings.updatedAt,
      createdAt: updatedSettings.createdAt,
    };
  } catch (error) {
    if (error instanceof HypebiscusMCPError) {
      throw error;
    }
    logger.error('Error updating reposition settings:', error);
    throw new HypebiscusMCPError(
      ErrorType.INTERNAL_ERROR,
      'Failed to update reposition settings',
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * Formats updated settings for display
 */
export function formatUpdateRepositionSettings(
  settings: RepositionSettings
): string {
  return JSON.stringify(
    {
      success: true,
      message: 'Settings updated successfully',
      settings: {
        autoRepositionEnabled: settings.autoRepositionEnabled,
        urgencyThreshold: settings.urgencyThreshold,
        maxGasCostSol: settings.maxGasCostSol,
        minFeesToCollectUsd: settings.minFeesToCollectUsd,
        allowedStrategies: settings.allowedStrategies,
        notifications: {
          telegram: settings.telegramNotifications,
          website: settings.websiteNotifications,
        },
        updatedFrom: settings.updatedFrom,
        updatedAt: settings.updatedAt.toISOString(),
      },
    },
    null,
    2
  );
}

/**
 * Formats error for display
 */
export function formatUpdateRepositionSettingsError(error: unknown): string {
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
