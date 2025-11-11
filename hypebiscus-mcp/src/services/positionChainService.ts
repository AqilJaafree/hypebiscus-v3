// Position Chain Service - Query and track position reposition history
import { prisma } from './database.js';
import { logger } from '../config.js';
import { PositionChain, PositionChainEntry, RepositionParams } from '../types/reposition.js';
import { ErrorType, HypebiscusMCPError } from '../tools/types.js';

export class PositionChainService {
  /**
   * Gets the complete chain of repositions for a position
   * @param positionAddress - Current or any position in the chain
   * @returns Position chain with full history
   */
  async getPositionChain(positionAddress: string): Promise<PositionChain | null> {
    try {
      logger.info(`Fetching position chain for ${positionAddress}`);

      // Find all positions in the chain (both forwards and backwards)
      const chain = await this.buildChain(positionAddress);

      if (chain.length === 0) {
        logger.info(`No reposition history found for ${positionAddress}`);
        return null;
      }

      // Calculate totals
      let totalFeesX = 0;
      let totalFeesY = 0;
      let totalGasCost = 0;

      const history: PositionChainEntry[] = chain.map((entry) => {
        // Convert Prisma Decimal to number
        const feesX = entry.feesClaimedX ? Number(entry.feesClaimedX) : 0;
        const feesY = entry.feesClaimedY ? Number(entry.feesClaimedY) : 0;
        const gasCost = entry.gasCostSol ? Number(entry.gasCostSol) : 0;
        const tokenX = entry.oldTokenXAmount ? Number(entry.oldTokenXAmount) : 0;
        const tokenY = entry.oldTokenYAmount ? Number(entry.oldTokenYAmount) : 0;

        totalFeesX += feesX;
        totalFeesY += feesY;
        totalGasCost += gasCost;

        return {
          id: entry.id,
          oldPositionAddress: entry.oldPositionAddress,
          newPositionAddress: entry.newPositionAddress,
          repositionReason: entry.repositionReason as 'out_of_range' | 'manual' | 'scheduled',
          oldBinRange: entry.oldBinRange,
          newBinRange: entry.newBinRange,
          activeBinAtReposition: entry.activeBinAtReposition,
          distanceFromRange: entry.distanceFromRange,
          liquidityRecovered: {
            tokenX,
            tokenY,
          },
          feesCollected: {
            tokenX: feesX,
            tokenY: feesY,
          },
          transactionSignature: entry.transactionSignature,
          gasCostSol: gasCost,
          createdAt: entry.createdAt,
        };
      });

      // Get current position (last in chain)
      const currentPosition = chain[chain.length - 1].newPositionAddress;

      // TODO: Calculate USD value when price data is available
      const totalFeesUSD = 0;

      const result: PositionChain = {
        currentPosition,
        chainLength: chain.length + 1, // +1 for original position
        totalRepositions: chain.length,
        history,
        totalFeesCollected: {
          tokenX: totalFeesX,
          tokenY: totalFeesY,
          totalUSD: totalFeesUSD,
        },
        totalGasCost,
      };

      logger.info(
        `Position chain retrieved: ${result.chainLength} positions, ${result.totalRepositions} repositions`
      );

      return result;
    } catch (error) {
      logger.error(`Failed to get position chain for ${positionAddress}:`, error);
      throw new HypebiscusMCPError(
        ErrorType.DATABASE_ERROR,
        'Failed to retrieve position chain',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Builds the complete chain by traversing forwards and backwards
   * @param positionAddress - Any position in the chain
   * @returns Array of reposition history entries in chronological order
   */
  private async buildChain(positionAddress: string) {
    interface RepositionRecord {
      id: string;
      oldPositionAddress: string;
      newPositionAddress: string;
      walletAddress: string;
      poolAddress: string;
      repositionReason: string;
      oldBinRange: string;
      newBinRange: string;
      activeBinAtReposition: number;
      distanceFromRange: number;
      transactionSignature: string | null;
      gasCostSol: unknown;
      oldTokenXAmount: unknown;
      oldTokenYAmount: unknown;
      feesClaimedX: unknown;
      feesClaimedY: unknown;
      newTokenXAmount: unknown;
      newTokenYAmount: unknown;
      strategy: string | null;
      createdAt: Date;
      updatedAt: Date;
    }

    const chain = new Map<string, RepositionRecord>();
    const visited = new Set<string>();

    // Find all entries where this position appears (as old or new)
    const allEntries = await prisma.position_reposition_history.findMany({
      where: {
        OR: [
          { oldPositionAddress: positionAddress },
          { newPositionAddress: positionAddress },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });

    if (allEntries.length === 0) {
      return [];
    }

    // Build map of all connected positions
    for (const entry of allEntries) {
      chain.set(entry.id, entry);
    }

    // Recursively find all connected positions
    await this.findConnected(positionAddress, chain, visited);

    // Sort by creation time
    const sortedChain = Array.from(chain.values()).sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );

    return sortedChain;
  }

  /**
   * Recursively finds all connected positions
   */
  private async findConnected(
    positionAddress: string,
    chain: Map<string, unknown>,
    visited: Set<string>
  ): Promise<void> {
    if (visited.has(positionAddress)) {
      return;
    }

    visited.add(positionAddress);

    // Find all positions connected to this one
    const connected = await prisma.position_reposition_history.findMany({
      where: {
        OR: [
          { oldPositionAddress: positionAddress },
          { newPositionAddress: positionAddress },
        ],
      },
    });

    for (const entry of connected) {
      if (!chain.has(entry.id)) {
        chain.set(entry.id, entry);
      }

      // Recursively find connections
      await this.findConnected(entry.oldPositionAddress, chain, visited);
      await this.findConnected(entry.newPositionAddress, chain, visited);
    }
  }

  /**
   * Records a reposition event in the database
   * @param params - Reposition parameters
   * @returns Created reposition record
   */
  async recordReposition(params: RepositionParams) {
    try {
      logger.info(
        `Recording reposition: ${params.oldPositionAddress} -> ${params.newPositionAddress}`
      );

      const record = await prisma.position_reposition_history.create({
        data: {
          oldPositionAddress: params.oldPositionAddress,
          newPositionAddress: params.newPositionAddress,
          walletAddress: params.walletAddress,
          poolAddress: params.poolAddress,
          repositionReason: params.repositionReason,
          oldBinRange: params.oldBinRange,
          newBinRange: params.newBinRange,
          activeBinAtReposition: params.activeBinAtReposition,
          distanceFromRange: params.distanceFromRange,
          transactionSignature: params.transactionSignature,
          gasCostSol: params.gasCostSol,
          oldTokenXAmount: params.oldTokenXAmount,
          oldTokenYAmount: params.oldTokenYAmount,
          feesClaimedX: params.feesClaimedX,
          feesClaimedY: params.feesClaimedY,
          newTokenXAmount: params.newTokenXAmount,
          newTokenYAmount: params.newTokenYAmount,
          strategy: params.strategy,
        },
      });

      logger.info(`Reposition recorded successfully: ${record.id}`);
      return record;
    } catch (error) {
      logger.error('Failed to record reposition:', error);
      throw new HypebiscusMCPError(
        ErrorType.DATABASE_ERROR,
        'Failed to record reposition',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Gets reposition statistics for a wallet
   * @param walletAddress - Wallet address
   * @returns Reposition statistics
   */
  async getWalletRepositionStats(walletAddress: string) {
    try {
      logger.info(`Fetching reposition stats for wallet ${walletAddress}`);

      const repositions = await prisma.position_reposition_history.findMany({
        where: { walletAddress },
        orderBy: { createdAt: 'desc' },
      });

      const totalRepositions = repositions.length;
      const reasons = repositions.reduce(
        (acc, r) => {
          acc[r.repositionReason] = (acc[r.repositionReason] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      const totalFeesCollected = repositions.reduce(
        (acc, r) => {
          acc.tokenX += r.feesClaimedX?.toNumber() ?? 0;
          acc.tokenY += r.feesClaimedY?.toNumber() ?? 0;
          return acc;
        },
        { tokenX: 0, tokenY: 0 }
      );

      const totalGasCost = repositions.reduce(
        (acc, r) => acc + (r.gasCostSol?.toNumber() ?? 0),
        0
      );

      return {
        totalRepositions,
        reasonBreakdown: reasons,
        totalFeesCollected,
        totalGasCost,
        recentRepositions: repositions.slice(0, 10).map((r) => ({
          id: r.id,
          oldPosition: r.oldPositionAddress,
          newPosition: r.newPositionAddress,
          reason: r.repositionReason,
          timestamp: r.createdAt,
        })),
      };
    } catch (error) {
      logger.error(`Failed to get reposition stats for wallet ${walletAddress}:`, error);
      throw new HypebiscusMCPError(
        ErrorType.DATABASE_ERROR,
        'Failed to retrieve reposition statistics',
        error instanceof Error ? error.message : String(error)
      );
    }
  }
}

// Export singleton instance
export const positionChainService = new PositionChainService();
