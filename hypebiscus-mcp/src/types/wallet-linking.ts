// Wallet Linking Types
// Types for cross-platform wallet linking between Telegram bot and Website

export type WalletSource = 'telegram' | 'website';
export type UrgencyThreshold = 'low' | 'medium' | 'high';
export type RepositionStrategy = 'one-sided-x' | 'one-sided-y' | 'balanced';

export interface WalletLinkToken {
  token: string; // Full 64-character token for QR code
  shortToken: string; // 8-character code for manual entry
  expiresAt: Date;
  qrCodeData: string; // URL or data string for QR code generation
  deepLink: string; // Telegram deep link URL for direct linking
}

export interface GenerateWalletLinkTokenInput {
  walletAddress: string; // Website wallet address requesting link
  expiresInMinutes?: number; // Default: 5 minutes
}

export interface LinkWalletInput {
  token: string; // Token from website QR code
  walletAddress: string; // Wallet address from QR code
  telegramUserId: string; // Telegram user ID to link
  expiresAt: string; // Expiration timestamp from QR code (ISO string)
  signature?: string; // HMAC signature for data integrity (required for security)
}

export interface GetLinkedAccountInput {
  walletAddress?: string; // Website wallet to check
  telegramUserId?: string; // Telegram user ID to check
}

export interface LinkedAccountInfo {
  isLinked: boolean;
  telegramUserId?: string;
  telegramUsername?: string;
  walletAddress?: string;
  linkedAt?: Date;
  source: WalletSource; // Which platform initiated the query
}

export interface UnlinkWalletInput {
  walletAddress?: string; // Unlink by website wallet
  telegramUserId?: string; // Unlink by telegram user
}

export interface RepositionSettings {
  userId: string;
  autoRepositionEnabled: boolean;
  urgencyThreshold: UrgencyThreshold;
  maxGasCostSol: number;
  minFeesToCollectUsd: number;
  allowedStrategies: RepositionStrategy[];
  telegramNotifications: boolean;
  websiteNotifications: boolean;
  updatedFrom?: WalletSource;
  updatedAt: Date;
  createdAt: Date;
}

export interface GetRepositionSettingsInput {
  walletAddress?: string; // Get settings by website wallet
  telegramUserId?: string; // Get settings by telegram user
}

export interface UpdateRepositionSettingsInput {
  walletAddress?: string; // Update by website wallet
  telegramUserId?: string; // Update by telegram user
  settings: Partial<{
    autoRepositionEnabled: boolean;
    urgencyThreshold: UrgencyThreshold;
    maxGasCostSol: number;
    minFeesToCollectUsd: number;
    allowedStrategies: RepositionStrategy[];
    telegramNotifications: boolean;
    websiteNotifications: boolean;
  }>;
  updatedFrom: WalletSource; // Platform making the update
}

export interface WalletLinkingError {
  error: string;
  message: string;
  details?: string;
}
