import { PublicKey } from '@solana/web3.js';

export interface UserWallet {
  userId: string;
  publicKey: string;
  privateKey: string; // Encrypted in production
  isActive: boolean;
}

export interface Position {
  userId: string;
  positionId: string;
  poolAddress: string;
  isActive: boolean;
  entryPrice: number;
  amount: number;
  createdAt: Date;
  lastChecked: Date;
}

export interface PoolStatus {
  currentPrice: number;
  activeBinId: number;
  priceChange24h: number;
  totalLiquidity: string;
}

export interface BotUser {
  id: string;
  telegramId: number;
  username?: string;
  wallet?: UserWallet;
  positions: Position[];
  isMonitoring: boolean;
}