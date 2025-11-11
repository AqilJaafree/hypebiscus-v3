// Generate Wallet Link Token Tool - Create QR code token for linking
import { PublicKey } from '@solana/web3.js';
import { randomBytes, createHmac } from 'crypto';
import { prisma } from '../services/database.js';
import { config, logger } from '../config.js';
import { ErrorType, HypebiscusMCPError } from './types.js';
import type {
  GenerateWalletLinkTokenInput,
  WalletLinkToken,
} from '../types/wallet-linking.js';

/**
 * Generates a secure token for linking website wallet with Telegram account
 * @param input - Wallet address and optional expiration time
 * @returns Token, expiration, and QR code data
 */
export async function generateWalletLinkToken(
  input: GenerateWalletLinkTokenInput
): Promise<WalletLinkToken> {
  try {
    logger.info(`Generating wallet link token for: ${input.walletAddress}`);

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

    // Check if wallet already has an active link
    const existingUser = await prisma.users.findFirst({
      where: {
        linkedWalletAddress: publicKey.toBase58(),
      },
    });

    if (existingUser) {
      throw new HypebiscusMCPError(
        ErrorType.VALIDATION_ERROR,
        'Wallet is already linked to a Telegram account',
        'Please unlink the existing connection first'
      );
    }

    // Generate cryptographically secure token (32 bytes = 64 hex chars)
    const token = randomBytes(32).toString('hex');

    // Generate short token (8 chars, uppercase, no confusing characters)
    // Exclude: 0, O, I, 1 (visually confusing)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let shortToken = '';
    for (let i = 0; i < 8; i++) {
      const randomIndex = randomBytes(1)[0] % chars.length;
      shortToken += chars[randomIndex];
    }

    // Calculate expiration (default: 5 minutes for better UX)
    const expiresInMinutes = Math.min(input.expiresInMinutes ?? 5, 10); // Max 10 minutes
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    // Store token in database for server-side validation
    await prisma.wallet_link_tokens.create({
      data: {
        token,
        shortToken,
        walletAddress: publicKey.toBase58(),
        expiresAt,
        used: false,
        ipAddress: null, // Can be populated if called from HTTP endpoint
      },
    });

    // Create HMAC signature binding token to wallet address
    const message = `${token}:${publicKey.toBase58()}:${expiresAt.toISOString()}`;
    const signature = createHmac('sha256', config.walletLinkSecret)
      .update(message)
      .digest('hex');

    // Create QR code data with HMAC signature
    const qrCodeData = JSON.stringify({
      type: 'hypebiscus_wallet_link',
      wallet: publicKey.toBase58(),
      token,
      expiresAt: expiresAt.toISOString(),
      signature, // Cryptographic binding prevents tampering
    });

    // Create Telegram deep link URL
    const deepLink = `https://t.me/testhypegarden_bot?start=link_${shortToken}`;

    logger.info(
      `Generated wallet link token (expires in ${expiresInMinutes} minutes) with HMAC signature and short token: ${shortToken}`
    );

    return {
      token,
      shortToken,
      expiresAt,
      qrCodeData,
      deepLink,
    };
  } catch (error) {
    if (error instanceof HypebiscusMCPError) {
      throw error;
    }
    logger.error('Error generating wallet link token:', error);
    throw new HypebiscusMCPError(
      ErrorType.INTERNAL_ERROR,
      'Failed to generate wallet link token',
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * Formats wallet link token for display
 */
export function formatGenerateWalletLinkToken(
  result: WalletLinkToken
): string {
  return JSON.stringify(
    {
      token: result.token,
      shortToken: result.shortToken,
      expiresAt: result.expiresAt.toISOString(),
      qrCodeData: result.qrCodeData,
      deepLink: result.deepLink,
      instructions: {
        method1_deepLink: 'Click the deep link to open Telegram and link automatically',
        method2_qrCode: 'Scan the QR code with your phone camera or Telegram bot',
        method3_manual: `Send the short token "${result.shortToken}" to @testhypegarden_bot using /link command`,
      },
    },
    null,
    2
  );
}

/**
 * Formats error for display
 */
export function formatGenerateWalletLinkTokenError(error: unknown): string {
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
