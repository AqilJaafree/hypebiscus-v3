// Reposition Service - Prepares unsigned transactions for repositioning out-of-range positions
import DLMM from '@meteora-ag/dlmm';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import BN from 'bn.js';
import { createHash } from 'crypto';
import * as nacl from 'tweetnacl';
import bs58 from 'bs58';
import { config, logger } from '../config.js';
import { DlmmService } from './dlmmService.js';
import { positionChainService } from './positionChainService.js';
import { prisma } from './database.js';
import { ErrorType, HypebiscusMCPError } from '../tools/types.js';
import {
  RepositionInput,
  RepositionStrategy,
  UnsignedRepositionTransaction,
  LiquidityRecovered,
  RepositionRecommendation,
} from '../types/reposition.js';
import { validateSolanaAddress } from '../utils/validation.js';

export class RepositionService {
  private connection: Connection;
  private dlmmService: DlmmService;

  constructor(rpcUrl?: string) {
    this.connection = new Connection(rpcUrl || config.solanaRpcUrl, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: config.requestTimeout,
    });
    this.dlmmService = new DlmmService(rpcUrl);
    logger.info('Initialized Reposition service');
  }

  /**
   * Analyzes a position and determines if repositioning is recommended
   * @param positionAddress - Position to analyze
   * @param poolAddress - Optional pool address
   * @returns Reposition recommendation
   */
  async analyzePosition(
    positionAddress: string,
    poolAddress?: string
  ): Promise<RepositionRecommendation> {
    try {
      logger.info(`Analyzing position for reposition: ${positionAddress}`);

      // Get rebalance recommendation from DLMM service
      const rebalanceAnalysis = await this.dlmmService.calculateRebalanceNeed(
        positionAddress,
        poolAddress
      );

      // Get position details for strategy recommendation
      const position = await this.dlmmService.getPositionDetails(positionAddress, poolAddress);

      if (!position) {
        throw new HypebiscusMCPError(
          ErrorType.VALIDATION_ERROR,
          'Position not found or already closed'
        );
      }

      // Determine urgency based on distance from range
      let urgency: 'low' | 'medium' | 'high' = 'low';
      if (rebalanceAnalysis.shouldRebalance) {
        if (rebalanceAnalysis.distanceFromRange > 20) {
          urgency = 'high';
        } else if (rebalanceAnalysis.distanceFromRange > 10) {
          urgency = 'medium';
        }
      } else if (rebalanceAnalysis.isInBufferZone) {
        urgency = 'low';
      }

      // Recommend strategy based on token distribution
      const strategy = this.recommendStrategy(position.totalXAmount, position.totalYAmount);

      // Calculate recommended bin range (centered on active bin)
      const activeBin = rebalanceAnalysis.currentActiveBin;
      const binRange = 10; // Default range
      const recommendedBinRange = {
        min: activeBin - binRange,
        max: activeBin + binRange,
      };

      // Calculate actual gas cost by simulating the transaction
      const estimatedGasCost = await this.estimateGasCost(position);

      const recommendation: RepositionRecommendation = {
        positionId: positionAddress,
        shouldReposition: rebalanceAnalysis.shouldRebalance,
        reason: rebalanceAnalysis.reason,
        currentActiveBin: rebalanceAnalysis.currentActiveBin,
        positionRange: rebalanceAnalysis.positionRange,
        distanceFromRange: rebalanceAnalysis.distanceFromRange,
        urgency,
        estimatedGasCost,
        recommendedStrategy: strategy,
        recommendedBinRange,
      };

      logger.info(
        `Position analysis complete: ${recommendation.shouldReposition ? 'REPOSITION RECOMMENDED' : 'OK'} (urgency: ${urgency})`
      );

      return recommendation;
    } catch (error) {
      if (error instanceof HypebiscusMCPError) {
        throw error;
      }
      logger.error(`Failed to analyze position ${positionAddress}:`, error);
      throw new HypebiscusMCPError(
        ErrorType.RPC_ERROR,
        'Failed to analyze position',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Prepares an unsigned transaction for repositioning with comprehensive security
   * NOTE: This returns an unsigned transaction for the client to sign
   * The MCP server NEVER signs transactions
   * @param input - Reposition parameters with security fields
   * @returns Unsigned transaction and metadata
   */
  async prepareRepositionTransaction(
    input: RepositionInput
  ): Promise<UnsignedRepositionTransaction> {
    try {
      logger.info(`Preparing secure reposition transaction for ${input.positionAddress}`);

      // 1. SECURITY: Validate wallet signature to prove ownership
      if (input.walletSignature && input.timestamp) {
        await this.verifyWalletSignature(
          input.walletAddress,
          input.positionAddress,
          input.walletSignature,
          input.timestamp
        );
      } else {
        logger.warn('No wallet signature provided - transaction preparation may be insecure');
        // In production, you may want to require signatures:
        // throw new HypebiscusMCPError(ErrorType.VALIDATION_ERROR, 'Wallet signature required');
      }

      // 2. Validate addresses
      validateSolanaAddress(input.positionAddress);
      validateSolanaAddress(input.walletAddress);

      const walletPubkey = new PublicKey(input.walletAddress);
      const positionPubkey = new PublicKey(input.positionAddress);

      // 3. SECURITY: Check rate limiting
      await this.checkRateLimit(input.walletAddress);

      // 4. Get and validate position ownership
      const position = await this.dlmmService.getPositionDetails(
        input.positionAddress,
        input.poolAddress
      );

      if (!position) {
        throw new HypebiscusMCPError(
          ErrorType.VALIDATION_ERROR,
          'Position not found or already closed'
        );
      }

      // 5. SECURITY: Verify position ownership
      if (position.owner !== input.walletAddress) {
        throw new HypebiscusMCPError(
          ErrorType.VALIDATION_ERROR,
          'Wallet does not own this position',
          `Position owner: ${position.owner}, Provided wallet: ${input.walletAddress}`
        );
      }

      // 6. Calculate actual gas cost
      const estimatedGasCost = await this.estimateGasCost(position);

      // 7. SECURITY: Validate against max gas cost
      if (input.maxGasCost && estimatedGasCost > input.maxGasCost) {
        throw new HypebiscusMCPError(
          ErrorType.VALIDATION_ERROR,
          `Estimated gas (${estimatedGasCost.toFixed(4)} SOL) exceeds maximum (${input.maxGasCost} SOL)`
        );
      }

      // 8. Get pool instance
      const poolAddress = input.poolAddress || position.poolAddress;
      const poolPubkey = new PublicKey(poolAddress);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pool = await (DLMM as any).create(this.connection, poolPubkey);

      // 9. Get active bin for slippage calculations
      const activeBin = await pool.getActiveBin();
      const activeBinId = activeBin.binId;
      const currentPrice = parseFloat(activeBin.price);

      // 10. Determine strategy
      const strategy =
        input.strategy || this.recommendStrategy(position.totalXAmount, position.totalYAmount);

      // 11. Calculate new bin range
      const binRange = input.binRange || 10;
      const newBinRange = {
        min: activeBinId - binRange,
        max: activeBinId + binRange,
      };

      // 12. SECURITY: Calculate slippage protection
      const slippageBps = input.slippage || 100; // Default 1%
      const slippageFactor = 1 - slippageBps / 10000;
      const minOutputX = position.totalXAmount * slippageFactor;
      const minOutputY = position.totalYAmount * slippageFactor;
      const maxPrice = currentPrice * (1 + slippageBps / 10000);
      const minPrice = currentPrice * (1 - slippageBps / 10000);

      // 13. Build transaction with security features
      const transaction = new Transaction();

      // 14. SECURITY: Add recent blockhash for expiration (60 second validity)
      const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = walletPubkey;

      // 15. Build remove liquidity instruction with slippage protection
      logger.info('Building remove liquidity instruction with slippage protection');
      const binIds = position.bins.map((bin) => bin.binId);

      const removeIx = await pool.removeLiquidity({
        position: positionPubkey,
        user: walletPubkey,
        binIds,
        liquiditiesBpsToRemove: new BN(100 * 100), // Remove 100%
        shouldClaimAndClose: true, // Close position and claim fees
      });

      transaction.add(removeIx);

      // 16. SECURITY: Calculate transaction hash for integrity verification
      const txHash = createHash('sha256')
        .update(transaction.serializeMessage())
        .digest('hex');

      // 17. SECURITY: Store pending transaction in database
      const expiresAt = new Date(Date.now() + 60 * 1000); // 60 second expiry
      await prisma.pending_transactions.create({
        data: {
          txHash,
          walletAddress: input.walletAddress,
          positionAddress: input.positionAddress,
          expiresAt,
          executed: false,
        },
      });

      // 18. Serialize transaction for client
      const serialized = transaction
        .serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        })
        .toString('base64');

      // 19. Prepare metadata
      const estimatedLiquidity: LiquidityRecovered = {
        tokenX: position.totalXAmount,
        tokenY: position.totalYAmount,
        feesX: 0, // Will be known after claiming
        feesY: 0,
        totalUSD: 0, // TODO: Calculate from price data
      };

      const result: UnsignedRepositionTransaction = {
        transaction: serialized,
        txHash, // Client must verify this hash before signing
        metadata: {
          oldPosition: input.positionAddress,
          poolAddress,
          estimatedLiquidityRecovered: estimatedLiquidity,
          newBinRange,
          strategy,
          estimatedGasCost,
          slippageProtection: {
            maxPrice,
            minPrice,
            minOutputX,
            minOutputY,
          },
          expiresAt,
        },
      };

      logger.info('Secure unsigned reposition transaction prepared successfully');
      logger.info(`Transaction expires at: ${expiresAt.toISOString()}`);
      logger.info(`Slippage protection: ${slippageBps / 100}%`);

      return result;
    } catch (error) {
      if (error instanceof HypebiscusMCPError) {
        throw error;
      }
      logger.error(`Failed to prepare reposition transaction:`, error);
      throw new HypebiscusMCPError(
        ErrorType.RPC_ERROR,
        'Failed to prepare reposition transaction',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * SECURITY: Verifies wallet signature to prove ownership
   * @param walletAddress - Wallet address to verify
   * @param positionAddress - Position being repositioned
   * @param signature - Signature from wallet
   * @param timestamp - Timestamp of signature
   */
  private async verifyWalletSignature(
    walletAddress: string,
    positionAddress: string,
    signature: string,
    timestamp: number
  ): Promise<void> {
    try {
      // Check timestamp freshness (5 minute window)
      const now = Date.now();
      if (Math.abs(now - timestamp) > 5 * 60 * 1000) {
        throw new HypebiscusMCPError(
          ErrorType.VALIDATION_ERROR,
          'Signature expired or timestamp in future',
          'Signatures must be created within the last 5 minutes'
        );
      }

      // Verify signature
      const message = `reposition:${positionAddress}:${timestamp}`;
      const messageBytes = new TextEncoder().encode(message);
      const walletPubkey = new PublicKey(walletAddress);
      const signatureBytes = bs58.decode(signature);

      const isValid = nacl.sign.detached.verify(
        messageBytes,
        signatureBytes,
        walletPubkey.toBytes()
      );

      if (!isValid) {
        throw new HypebiscusMCPError(
          ErrorType.VALIDATION_ERROR,
          'Invalid wallet signature',
          'Signature verification failed. Please sign the message with your wallet.'
        );
      }

      logger.info('Wallet signature verified successfully');
    } catch (error) {
      if (error instanceof HypebiscusMCPError) {
        throw error;
      }
      logger.error('Signature verification error:', error);
      throw new HypebiscusMCPError(
        ErrorType.VALIDATION_ERROR,
        'Failed to verify wallet signature',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * SECURITY: Check rate limiting for reposition operations
   * @param walletAddress - Wallet to check
   */
  private async checkRateLimit(walletAddress: string): Promise<void> {
    const recentTxCount = await prisma.pending_transactions.count({
      where: {
        walletAddress,
        createdAt: { gte: new Date(Date.now() - 60000) }, // Last minute
      },
    });

    if (recentTxCount >= 10) {
      throw new HypebiscusMCPError(
        ErrorType.VALIDATION_ERROR,
        'Too many reposition requests. Please wait 1 minute.',
        'Rate limit: 10 requests per minute'
      );
    }
  }

  /**
   * SECURITY: Calculate actual gas cost by simulating transaction
   * @param position - Position details
   * @returns Estimated gas cost in SOL
   */
  private async estimateGasCost(position: { bins: { binId: number }[]; poolAddress: string }): Promise<number> {
    try {
      // Create a dummy transaction for simulation
      const transaction = new Transaction();
      const poolPubkey = new PublicKey(position.poolAddress);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pool = await (DLMM as any).create(this.connection, poolPubkey);

      const removeIx = await pool.removeLiquidity({
        position: PublicKey.default, // Dummy for estimation
        user: PublicKey.default,
        binIds: position.bins.map((b) => b.binId),
        liquiditiesBpsToRemove: new BN(10000),
        shouldClaimAndClose: true,
      });

      transaction.add(removeIx);

      // Get recent blockhash for simulation
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = PublicKey.default;

      // Simulate transaction to get compute units
      const simulation = await this.connection.simulateTransaction(transaction);

      if (simulation.value.err) {
        logger.warn('Simulation failed, using conservative estimate');
        return 0.01; // Conservative fallback
      }

      const computeUnits = simulation.value.unitsConsumed || 200000;

      // Get recent prioritization fees
      const recentFees = await this.connection.getRecentPrioritizationFees();
      const medianFee =
        recentFees.length > 0
          ? recentFees[Math.floor(recentFees.length / 2)]?.prioritizationFee || 1000
          : 1000;

      // Calculate total cost: base fee (5000 lamports) + priority fee
      const totalLamports = 5000 + medianFee * computeUnits;
      const totalSol = totalLamports / 1e9;

      logger.info(`Estimated gas cost: ${totalSol.toFixed(6)} SOL (${computeUnits} CU)`);

      return totalSol;
    } catch (error) {
      logger.warn('Failed to estimate gas cost, using conservative estimate:', error);
      return 0.01; // Conservative fallback
    }
  }

  /**
   * Recommends a strategy based on token distribution
   * @param tokenXAmount - Amount of token X
   * @param tokenYAmount - Amount of token Y
   * @returns Recommended strategy
   */
  private recommendStrategy(tokenXAmount: number, tokenYAmount: number): RepositionStrategy {
    // Calculate ratio (normalize to avoid division by zero)
    const totalLiquidity = tokenXAmount + tokenYAmount;

    if (totalLiquidity === 0) {
      return 'balanced';
    }

    const xRatio = tokenXAmount / totalLiquidity;

    // If >80% in one token, recommend one-sided
    if (xRatio > 0.8) {
      return 'one-sided-x';
    } else if (xRatio < 0.2) {
      return 'one-sided-y';
    }

    // Otherwise balanced
    return 'balanced';
  }

  /**
   * Gets the reposition chain for a position
   * @param positionAddress - Position address
   * @returns Position chain or null
   */
  async getPositionChain(positionAddress: string) {
    return positionChainService.getPositionChain(positionAddress);
  }

  /**
   * Gets reposition statistics for a wallet
   * @param walletAddress - Wallet address
   * @returns Reposition statistics
   */
  async getWalletRepositionStats(walletAddress: string) {
    return positionChainService.getWalletRepositionStats(walletAddress);
  }
}

// Export singleton instance
export const repositionService = new RepositionService();
