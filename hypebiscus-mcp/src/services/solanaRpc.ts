// Solana RPC service for on-chain data
import { Connection, PublicKey, AccountInfo } from '@solana/web3.js';
import { config, logger } from '../config.js';
import { ErrorType, HypebiscusMCPError } from '../tools/types.js';
import { validateSolanaAddress } from '../utils/validation.js';
import { withRetry } from '../utils/errors.js';

export class SolanaRpcService {
  private connection: Connection;

  constructor(rpcUrl?: string) {
    this.connection = new Connection(rpcUrl || config.solanaRpcUrl, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: config.requestTimeout,
    });
    logger.info(`Initialized Solana RPC connection: ${rpcUrl || config.solanaRpcUrl}`);
  }

  /**
   * Gets account info for a given address
   * @param address - The account address
   * @returns Account info or null
   */
  async getAccountInfo(address: string): Promise<AccountInfo<Buffer> | null> {
    try {
      validateSolanaAddress(address);
      const publicKey = new PublicKey(address);

      return await withRetry(
        async () => {
          const accountInfo = await this.connection.getAccountInfo(publicKey);
          logger.debug(`Retrieved account info for ${address}`);
          return accountInfo;
        },
        3,
        1000
      );
    } catch (error) {
      logger.error(`Failed to get account info for ${address}:`, error);
      throw new HypebiscusMCPError(
        ErrorType.RPC_ERROR,
        `Failed to fetch account info for ${address}`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Gets multiple accounts info in a single RPC call
   * @param addresses - Array of account addresses
   * @returns Array of account info or null
   */
  async getMultipleAccountsInfo(addresses: string[]): Promise<(AccountInfo<Buffer> | null)[]> {
    try {
      const publicKeys = addresses.map((addr) => {
        validateSolanaAddress(addr);
        return new PublicKey(addr);
      });

      return await withRetry(
        async () => {
          const accountsInfo = await this.connection.getMultipleAccountsInfo(publicKeys);
          logger.debug(`Retrieved ${accountsInfo.length} accounts info`);
          return accountsInfo;
        },
        3,
        1000
      );
    } catch (error) {
      logger.error('Failed to get multiple accounts info:', error);
      throw new HypebiscusMCPError(
        ErrorType.RPC_ERROR,
        'Failed to fetch multiple accounts info',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Parses token account data from raw account info
   * @param data - Raw account data
   * @returns Parsed token account or null
   */
  parseTokenAccount(data: Buffer): { mint: string; owner: string; amount: bigint } | null {
    try {
      // SPL Token account layout:
      // 0-32: mint (PublicKey)
      // 32-64: owner (PublicKey)
      // 64-72: amount (u64)

      if (data.length < 72) {
        return null;
      }

      const mint = new PublicKey(data.slice(0, 32)).toBase58();
      const owner = new PublicKey(data.slice(32, 64)).toBase58();
      const amount = data.readBigUInt64LE(64);

      return { mint, owner, amount };
    } catch (error) {
      logger.warn('Failed to parse token account:', error);
      return null;
    }
  }

  /**
   * Gets the token balance for an account
   * @param tokenAccountAddress - Token account address
   * @returns Token balance in smallest unit
   */
  async getTokenBalance(tokenAccountAddress: string): Promise<bigint> {
    try {
      const accountInfo = await this.getAccountInfo(tokenAccountAddress);

      if (!accountInfo) {
        throw new HypebiscusMCPError(
          ErrorType.RPC_ERROR,
          `Token account ${tokenAccountAddress} not found`
        );
      }

      const tokenAccount = this.parseTokenAccount(accountInfo.data);

      if (!tokenAccount) {
        throw new HypebiscusMCPError(
          ErrorType.RPC_ERROR,
          `Failed to parse token account ${tokenAccountAddress}`
        );
      }

      return tokenAccount.amount;
    } catch (error) {
      if (error instanceof HypebiscusMCPError) {
        throw error;
      }

      logger.error(`Failed to get token balance for ${tokenAccountAddress}:`, error);
      throw new HypebiscusMCPError(
        ErrorType.RPC_ERROR,
        `Failed to get token balance`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Gets the current slot
   * @returns Current slot number
   */
  async getCurrentSlot(): Promise<number> {
    try {
      return await withRetry(
        async () => {
          const slot = await this.connection.getSlot();
          logger.debug(`Current slot: ${slot}`);
          return slot;
        },
        3,
        1000
      );
    } catch (error) {
      logger.error('Failed to get current slot:', error);
      throw new HypebiscusMCPError(
        ErrorType.RPC_ERROR,
        'Failed to get current slot',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Checks if the RPC connection is healthy
   * @returns True if healthy, false otherwise
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.connection.getSlot();
      logger.debug('RPC health check passed');
      return true;
    } catch (error) {
      logger.error('RPC health check failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const solanaRpc = new SolanaRpcService();
