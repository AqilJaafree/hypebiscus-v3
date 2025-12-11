// Tool: get_wallet_pnl - Get aggregated PnL for all positions in a wallet
import { Connection } from '@solana/web3.js';
import { logger, config } from '../config.js';
import { dbUtils } from '../services/database.js';
import { validateSolanaAddress } from '../utils/validation.js';
import { withErrorHandling, formatError } from '../utils/errors.js';
import { withCache } from '../utils/cache.js';
import { calculatePositionPnL } from '../services/pnlCalculator.js';
import type { WalletPnLResult, PositionPnLResult } from '../types/pnl.js';
import { DatabaseError, DatabaseErrorType } from '../types/database.js';

export interface GetWalletPnLInput {
  walletAddress: string;
  includeClosedPositions?: boolean; // Default: true
}

/**
 * Get aggregated PnL for all positions in a wallet
 *
 * This tool:
 * 1. Fetches all positions for the wallet
 * 2. Calculates PnL for each position (open: unrealized, closed: realized)
 * 3. Aggregates totals (total PnL, IL, fees, rewards)
 * 4. Returns detailed breakdown
 *
 * @param input - Wallet address and options
 * @returns Aggregated wallet PnL with position details
 */
export async function getWalletPnL_tool(input: GetWalletPnLInput): Promise<WalletPnLResult> {
  return withErrorHandling(async () => {
    const { walletAddress, includeClosedPositions = true } = input;

    // Validate wallet address
    try {
      validateSolanaAddress(walletAddress);
    } catch (error) {
      throw new DatabaseError(
        DatabaseErrorType.INVALID_INPUT,
        `Invalid wallet address: ${walletAddress}`,
        'Wallet address must be a valid Solana public key'
      );
    }

    logger.info(
      `[MCP Tool] Getting wallet PnL for: ${walletAddress} ` +
        `(includeClosed: ${includeClosedPositions})`
    );

    // Create cache key
    const cacheKey = `pnl:wallet:${walletAddress}:${includeClosedPositions}`;

    const walletPnL = await withCache(
      cacheKey,
      async () => {
        // Find user by wallet
        const user = await dbUtils.findUserByWallet(walletAddress);

        if (!user) {
          throw new DatabaseError(
            DatabaseErrorType.USER_NOT_FOUND,
            `No user found with wallet address: ${walletAddress}`,
            'This wallet address is not registered in the system'
          );
        }

        // Get all positions for user
        const dbPositions = await dbUtils.findPositionsByUserId(user.id, !includeClosedPositions);

        if (dbPositions.length === 0) {
          // Return empty result
          return {
            walletAddress,
            totalPnlUsd: 0,
            totalPositions: 0,
            activePositions: 0,
            closedPositions: 0,
            totalImpermanentLossUsd: 0,
            totalFeesEarnedUsd: 0,
            totalRewardsEarnedUsd: 0,
            positions: [],
          };
        }

        logger.info(`[MCP Tool] Found ${dbPositions.length} positions for wallet`);

        // Calculate PnL for each position
        const connection = new Connection(config.solanaRpcUrl, {
          commitment: 'confirmed',
          confirmTransactionInitialTimeout: config.requestTimeout,
        });

        const positionPnLs: PositionPnLResult[] = [];
        let totalPnlUsd = 0;
        let totalImpermanentLossUsd = 0;
        let totalFeesEarnedUsd = 0;
        let totalRewardsEarnedUsd = 0;
        let activeCount = 0;
        let closedCount = 0;

        // Process positions (limit concurrent requests to avoid rate limiting)
        const batchSize = 3;
        for (let i = 0; i < dbPositions.length; i += batchSize) {
          const batch = dbPositions.slice(i, i + batchSize);

          const batchResults = await Promise.allSettled(
            batch.map((pos) => calculatePositionPnL(pos.positionId, connection))
          );

          for (let j = 0; j < batchResults.length; j++) {
            const result = batchResults[j];

            if (result.status === 'fulfilled') {
              const pnl = result.value;
              positionPnLs.push(pnl);

              // Aggregate totals
              totalPnlUsd += pnl.realizedPnlUsd;
              totalImpermanentLossUsd += pnl.impermanentLoss.usd;
              totalFeesEarnedUsd += pnl.feesEarnedUsd;
              totalRewardsEarnedUsd += pnl.rewardsEarnedUsd;

              if (pnl.status === 'open') {
                activeCount++;
              } else {
                closedCount++;
              }
            } else {
              const pos = batch[j];
              logger.error(
                `[MCP Tool] Failed to calculate PnL for position ${pos.positionId}:`,
                result.reason
              );

              // Create a fallback PnL result using DB values
              const fallbackPnL = createFallbackPnL(pos);
              positionPnLs.push(fallbackPnL);

              totalPnlUsd += fallbackPnL.realizedPnlUsd;
              totalImpermanentLossUsd += fallbackPnL.impermanentLoss.usd;
              totalFeesEarnedUsd += fallbackPnL.feesEarnedUsd;
              totalRewardsEarnedUsd += fallbackPnL.rewardsEarnedUsd;

              if (fallbackPnL.status === 'open') {
                activeCount++;
              } else {
                closedCount++;
              }
            }
          }

          // Add small delay between batches to avoid rate limiting
          if (i + batchSize < dbPositions.length) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }

        // Sort: Active first, then by PnL (best to worst)
        positionPnLs.sort((a, b) => {
          if (a.status === 'open' && b.status !== 'open') return -1;
          if (a.status !== 'open' && b.status === 'open') return 1;
          return b.realizedPnlUsd - a.realizedPnlUsd;
        });

        return {
          walletAddress,
          totalPnlUsd,
          totalPositions: positionPnLs.length,
          activePositions: activeCount,
          closedPositions: closedCount,
          totalImpermanentLossUsd,
          totalFeesEarnedUsd,
          totalRewardsEarnedUsd,
          positions: positionPnLs,
        };
      },
      30 // Cache for 30 seconds
    );

    logger.info(
      `[MCP Tool] Wallet PnL calculated: ${walletPnL.totalPositions} positions, ` +
        `Total PnL: $${walletPnL.totalPnlUsd.toFixed(2)}, ` +
        `Total IL: $${walletPnL.totalImpermanentLossUsd.toFixed(2)}, ` +
        `Total Fees: $${walletPnL.totalFeesEarnedUsd.toFixed(2)}`
    );

    return walletPnL;
  }, 'get wallet PnL');
}

/**
 * Create fallback PnL result from DB values when blockchain calculation fails
 */
function createFallbackPnL(dbPosition: any): PositionPnLResult {
  const depositValueUsd = Number(dbPosition.depositValueUsd || 0);
  const currentValueUsd = Number(dbPosition.withdrawValueUsd || depositValueUsd);
  const realizedPnlUsd = Number(dbPosition.realizedPnlUsd || dbPosition.pnlUsd || 0);
  const realizedPnlPercent = Number(dbPosition.realizedPnlPercent || dbPosition.pnlPercent || 0);
  const impermanentLossUsd = Number(dbPosition.impermanentLossUsd || 0);
  const impermanentLossPercent = Number(dbPosition.impermanentLossPercent || 0);
  const feesEarnedUsd = Number(dbPosition.feesEarnedUsd || 0);
  const rewardsEarnedUsd = Number(dbPosition.rewardsEarnedUsd || 0);

  const depositTokenXPrice = Number(dbPosition.depositTokenXPrice || dbPosition.entryPrice || 0);
  const depositTokenYPrice = Number(dbPosition.depositTokenYPrice || 0);
  const withdrawTokenXPrice = Number(
    dbPosition.withdrawTokenXPrice || dbPosition.exitPrice || depositTokenXPrice
  );
  const withdrawTokenYPrice = Number(dbPosition.withdrawTokenYPrice || depositTokenYPrice);

  const tokenXAmount = Number(dbPosition.zbtcAmount);
  const tokenYAmount = Number(dbPosition.solAmount);
  const tokenXReturned = Number(dbPosition.zbtcReturned || tokenXAmount);
  const tokenYReturned = Number(dbPosition.solReturned || tokenYAmount);

  return {
    positionId: dbPosition.positionId,
    status: dbPosition.isActive ? 'open' : 'closed',
    depositValueUsd,
    currentValueUsd,
    realizedPnlUsd,
    realizedPnlPercent,
    impermanentLoss: {
      usd: impermanentLossUsd,
      percent: impermanentLossPercent,
    },
    feesEarnedUsd,
    rewardsEarnedUsd,
    deposit: {
      tokenX: {
        amount: tokenXAmount,
        price: depositTokenXPrice,
        usdValue: tokenXAmount * depositTokenXPrice,
      },
      tokenY: {
        amount: tokenYAmount,
        price: depositTokenYPrice,
        usdValue: tokenYAmount * depositTokenYPrice,
      },
      timestamp: dbPosition.createdAt.toISOString(),
    },
    current: {
      tokenX: {
        amount: tokenXReturned,
        price: withdrawTokenXPrice,
        usdValue: tokenXReturned * withdrawTokenXPrice,
      },
      tokenY: {
        amount: tokenYReturned,
        price: withdrawTokenYPrice,
        usdValue: tokenYReturned * withdrawTokenYPrice,
      },
      timestamp: dbPosition.closedAt?.toISOString() || new Date().toISOString(),
    },
    fees: {
      tokenX: {
        amount: Number(dbPosition.zbtcFees || 0),
        claimedUsd: 0,
        unclaimedUsd: feesEarnedUsd / 2, // Approximate split
      },
      tokenY: {
        amount: Number(dbPosition.solFees || 0),
        claimedUsd: 0,
        unclaimedUsd: feesEarnedUsd / 2, // Approximate split
      },
    },
    rewards: [],
  };
}

/**
 * Format wallet PnL result as human-readable string
 */
export function formatWalletPnL(walletPnL: WalletPnLResult): string {
  const lines: string[] = [];

  lines.push(`Wallet PnL Report: ${walletPnL.walletAddress.slice(0, 8)}...${walletPnL.walletAddress.slice(-6)}`);
  lines.push('═'.repeat(80));
  lines.push('');

  // Summary
  lines.push('SUMMARY:');
  lines.push(`  Total Positions: ${walletPnL.totalPositions}`);
  lines.push(`  Active: ${walletPnL.activePositions} | Closed: ${walletPnL.closedPositions}`);
  lines.push('');

  // Overall PnL
  const pnlSign = walletPnL.totalPnlUsd >= 0 ? '+' : '';
  const pnlEmoji = walletPnL.totalPnlUsd >= 0 ? '📈' : '📉';
  lines.push('OVERALL PERFORMANCE:');
  lines.push(
    `  ${pnlEmoji} Total PnL: ${pnlSign}$${walletPnL.totalPnlUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  );
  lines.push(`  💰 Total Fees Earned: $${walletPnL.totalFeesEarnedUsd.toFixed(2)}`);
  lines.push(
    `  📊 Total IL: ${walletPnL.totalImpermanentLossUsd >= 0 ? '+' : ''}$${walletPnL.totalImpermanentLossUsd.toFixed(2)}`
  );
  if (walletPnL.totalRewardsEarnedUsd > 0) {
    lines.push(`  🎁 Total Rewards: $${walletPnL.totalRewardsEarnedUsd.toFixed(2)}`);
  }
  lines.push('');

  // Positions breakdown
  if (walletPnL.positions.length > 0) {
    lines.push('POSITIONS:');
    lines.push('-'.repeat(80));
    lines.push('');

    for (let i = 0; i < Math.min(walletPnL.positions.length, 10); i++) {
      const pos = walletPnL.positions[i];
      const statusEmoji = pos.status === 'open' ? '🟢' : '🔴';
      const pnlSign = pos.realizedPnlUsd >= 0 ? '+' : '';

      lines.push(
        `${i + 1}. ${statusEmoji} ${pos.positionId.slice(0, 8)}... | ` +
          `${pnlSign}$${pos.realizedPnlUsd.toFixed(2)} (${pnlSign}${pos.realizedPnlPercent.toFixed(2)}%) | ` +
          `Fees: $${pos.feesEarnedUsd.toFixed(2)}`
      );
    }

    if (walletPnL.positions.length > 10) {
      lines.push('');
      lines.push(`... and ${walletPnL.positions.length - 10} more positions`);
    }
  }

  lines.push('');
  lines.push('═'.repeat(80));

  return lines.join('\n');
}

/**
 * Format error for tool response
 */
export function formatWalletPnLError(error: unknown): string {
  return `Failed to get wallet PnL.\n\n${formatError(error)}\n\nPlease check the wallet address and try again.`;
}
