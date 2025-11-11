// Tool: get_user_positions_with_sync - Hybrid data sync for user positions
// Fetches both database (historical) and blockchain (real-time) positions and merges them

import { Connection, PublicKey } from '@solana/web3.js';
import DLMM from '@meteora-ag/dlmm';
import { config, logger } from '../config.js';
import { dbUtils } from '../services/database.js';
import { dlmmService } from '../services/dlmmService.js';
import { priceApi } from '../services/priceApi.js';
import { withErrorHandling, formatError } from '../utils/errors.js';
import { validateSolanaAddress } from '../utils/validation.js';
import { decimalToNumber } from '../types/database.js';
import {
  SyncPositionInput,
  SyncPosition,
  PositionHealth,
  SyncSummary,
} from '../types/sync.js';

/**
 * Fetches user positions with hybrid data sync
 * Merges database (historical) and blockchain (real-time) data
 * @param input - Sync position input parameters
 * @returns Array of synced positions
 */
export async function getUserPositionsWithSync(
  input: SyncPositionInput
): Promise<{ positions: SyncPosition[]; summary: SyncSummary }> {
  return withErrorHandling(async () => {
    const {
      walletAddress,
      includeHistorical = true,
      includeLive = true,
      positionId,
    } = input;

    // Validate wallet address
    validateSolanaAddress(walletAddress);

    logger.info(`Starting hybrid sync for wallet: ${walletAddress}`);
    logger.info(`includeHistorical: ${includeHistorical}, includeLive: ${includeLive}`);
    if (positionId) {
      logger.info(`Filtering to specific position: ${positionId}`);
    }

    const positionMap = new Map<string, SyncPosition>();
    let dbPositionCount = 0;
    let blockchainPositionCount = 0;

    // Step 1: Fetch historical positions from database
    if (includeHistorical) {
      try {
        logger.info('Fetching positions from database...');

        // Find user by wallet
        const user = await dbUtils.findUserByWallet(walletAddress);

        if (user) {
          const dbPositions = await dbUtils.findPositionsByUserId(user.id, true);
          dbPositionCount = dbPositions.length;

          for (const pos of dbPositions) {
            const position: SyncPosition = {
              positionId: pos.positionId,
              poolAddress: pos.poolAddress,
              status: pos.isActive ? 'active' : 'closed',
              source: 'database',
              tokenX: {
                symbol: 'zBTC',
                amount: decimalToNumber(pos.zbtcAmount) ?? 0,
                usdValue: 0, // Will be enriched with prices
              },
              tokenY: {
                symbol: 'SOL',
                amount: decimalToNumber(pos.solAmount) ?? 0,
                usdValue: 0, // Will be enriched with prices
              },
              totalLiquidityUSD: 0,
              entryDate: pos.createdAt.toISOString(),
              exitDate: pos.closedAt?.toISOString() ?? null,
              entryBin: pos.entryBin,
              exitBin: pos.exitBin ?? null,
              fees: {
                tokenX: decimalToNumber(pos.zbtcFees) ?? 0,
                tokenY: decimalToNumber(pos.solFees) ?? 0,
                totalUSD: 0, // Will be enriched with prices
                claimed: {
                  tokenX: decimalToNumber(pos.zbtcFees) ?? 0,
                  tokenY: decimalToNumber(pos.solFees) ?? 0,
                  totalUSD: 0, // Will be enriched with prices
                },
              },
              pnl: pos.pnlUsd
                ? {
                    usd: decimalToNumber(pos.pnlUsd) ?? 0,
                    percent: decimalToNumber(pos.pnlPercent) ?? 0,
                  }
                : null,
              health: null, // Only available for active positions from blockchain
              timestamp: new Date().toISOString(),
            };

            positionMap.set(pos.positionId, position);
          }

          logger.info(`Fetched ${dbPositions.length} positions from database`);
        } else {
          logger.info('User not found in database, skipping database positions');
        }
      } catch (error) {
        logger.warn('Failed to fetch database positions:', error);
      }
    }

    // Step 2: Fetch live positions from blockchain
    if (includeLive) {
      try {
        logger.info('Fetching positions from blockchain...');

        const connection = new Connection(config.solanaRpcUrl, {
          commitment: 'confirmed',
          confirmTransactionInitialTimeout: config.requestTimeout,
        });
        const publicKey = new PublicKey(walletAddress);

        // Get all on-chain positions
        const livePositions = await DLMM.getAllLbPairPositionsByUser(
          connection,
          publicKey
        );

        logger.info(`Found ${livePositions.size} position pools on blockchain`);

        // Process each pool's positions
        for (const [poolAddress, positionInfo] of livePositions.entries()) {
          const poolAddressStr = String(poolAddress);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const positions = (positionInfo as any).lbPairPositionsData || [];

          logger.debug(`Processing ${positions.length} positions in pool ${poolAddressStr}`);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const pos of positions as any[]) {
            const positionId = pos.publicKey?.toBase58() || String(pos.publicKey);
            blockchainPositionCount++;

            // Get detailed position data
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const positionData = pos.positionData as any;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const bins = (positionData?.positionBinData || []) as any[];

            if (bins.length === 0) {
              logger.debug(`Position ${positionId} has no bins, skipping`);
              continue;
            }

            const binIds = bins.map((bin) => Number(bin.binId));
            const minBinId = Math.min(...binIds);
            const maxBinId = Math.max(...binIds);

            // Calculate token amounts (zBTC uses 8 decimals, SOL uses 9)
            // Handle both string and bigint types from SDK
            const xAmount = parseFloat(String(positionData.totalXAmount || 0)) / Math.pow(10, 8);
            const yAmount = parseFloat(String(positionData.totalYAmount || 0)) / Math.pow(10, 9);
            const xFees = parseFloat(String(positionData.feeX || 0)) / Math.pow(10, 8);
            const yFees = parseFloat(String(positionData.feeY || 0)) / Math.pow(10, 9);

            // Calculate position health
            let health: PositionHealth | null = null;
            try {
              const poolStatus = await dlmmService.getPoolStatus(poolAddressStr);
              const activeBinId = poolStatus.activeBinId;

              const isInRange = activeBinId >= minBinId && activeBinId <= maxBinId;

              let healthStatus: 'healthy' | 'at-edge' | 'out-of-range' = 'healthy';
              let distanceFromActiveBin = 0;

              if (!isInRange) {
                healthStatus = 'out-of-range';
                distanceFromActiveBin = Math.abs(
                  activeBinId - (activeBinId < minBinId ? minBinId : maxBinId)
                );
              } else {
                const rangeSize = maxBinId - minBinId;
                const edgeThreshold = Math.max(3, Math.floor(rangeSize * 0.1));
                const distToMin = activeBinId - minBinId;
                const distToMax = maxBinId - activeBinId;

                if (distToMin <= edgeThreshold || distToMax <= edgeThreshold) {
                  healthStatus = 'at-edge';
                  distanceFromActiveBin = Math.min(distToMin, distToMax);
                }
              }

              health = {
                isInRange,
                status: healthStatus,
                distanceFromActiveBin,
              };
            } catch (error) {
              logger.warn(`Failed to calculate health for position ${positionId}:`, error);
            }

            // Get existing database position if it exists
            const dbPosition = positionMap.get(positionId);

            const position: SyncPosition = {
              positionId,
              poolAddress: poolAddressStr,
              status: 'active',
              source: dbPosition ? 'both' : 'blockchain',
              tokenX: {
                symbol: 'zBTC',
                amount: xAmount,
                usdValue: 0, // Will be enriched with prices
              },
              tokenY: {
                symbol: 'SOL',
                amount: yAmount,
                usdValue: 0, // Will be enriched with prices
              },
              totalLiquidityUSD: 0,
              entryDate: dbPosition?.entryDate ?? new Date().toISOString(),
              exitDate: null,
              entryBin: dbPosition?.entryBin ?? minBinId,
              exitBin: null,
              fees: {
                tokenX: xFees,
                tokenY: yFees,
                totalUSD: 0, // Will be enriched with prices
                claimed: {
                  tokenX: dbPosition?.fees.claimed.tokenX ?? 0,
                  tokenY: dbPosition?.fees.claimed.tokenY ?? 0,
                  totalUSD: 0,
                },
              },
              pnl: dbPosition?.pnl ?? null,
              health,
              timestamp: new Date().toISOString(),
            };

            positionMap.set(positionId, position);
          }
        }

        logger.info(`Processed ${blockchainPositionCount} positions from blockchain`);
      } catch (error) {
        logger.warn('Failed to fetch blockchain positions:', error);
      }
    }

    // Step 3: Filter by positionId if specified
    let positions = Array.from(positionMap.values());

    if (positionId) {
      const filteredPosition = positions.find((p) => p.positionId === positionId);
      if (!filteredPosition) {
        logger.warn(`Position ${positionId} not found for wallet ${walletAddress}`);
        positions = [];
      } else {
        positions = [filteredPosition];
        logger.info(`Filtered to single position: ${positionId}`);
      }
    }

    // Step 4: Enrich all positions with USD prices
    let enrichedCount = 0;

    try {
      logger.info('Fetching token prices...');

      const prices = await priceApi.getMultiplePrices([
        { symbol: 'zBTC' },
        { symbol: 'SOL' },
      ]);

      const zbtcPrice = prices.get('zBTC')?.price ?? 0;
      const solPrice = prices.get('SOL')?.price ?? 0;

      logger.info(`Prices: zBTC=$${zbtcPrice.toFixed(2)}, SOL=$${solPrice.toFixed(2)}`);

      for (const position of positions) {
        // Calculate USD values
        position.tokenX.usdValue = position.tokenX.amount * zbtcPrice;
        position.tokenY.usdValue = position.tokenY.amount * solPrice;
        position.totalLiquidityUSD = position.tokenX.usdValue + position.tokenY.usdValue;

        // Calculate fee USD values
        position.fees.totalUSD =
          position.fees.tokenX * zbtcPrice + position.fees.tokenY * solPrice;
        position.fees.claimed.totalUSD =
          position.fees.claimed.tokenX * zbtcPrice + position.fees.claimed.tokenY * solPrice;

        enrichedCount++;
      }

      logger.info(`Enriched ${enrichedCount} positions with price data`);
    } catch (error) {
      logger.warn('Failed to fetch price data:', error);
      // Continue without USD values
    }

    // Sort: Active first, then by liquidity value
    positions.sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (a.status !== 'active' && b.status === 'active') return 1;
      return b.totalLiquidityUSD - a.totalLiquidityUSD;
    });

    // Create summary
    const activePositions = positions.filter((p) => p.status === 'active');
    const closedPositions = positions.filter((p) => p.status === 'closed');
    const mergedPositions = positions.filter((p) => p.source === 'both');

    const summary: SyncSummary = {
      totalPositions: positions.length,
      activePositions: activePositions.length,
      closedPositions: closedPositions.length,
      databasePositions: dbPositionCount,
      blockchainPositions: blockchainPositionCount,
      mergedPositions: mergedPositions.length,
    };

    logger.info(
      `Sync complete: ${positions.length} total positions ` +
        `(${activePositions.length} active, ${closedPositions.length} closed, ` +
        `${mergedPositions.length} merged)`
    );

    return { positions, summary };
  }, 'get user positions with sync');
}

/**
 * Formats synced positions as human-readable string
 * @param positions - Array of synced positions
 * @param summary - Sync summary
 * @returns Formatted string
 */
export function formatSyncPositions(positions: SyncPosition[], summary: SyncSummary): string {
  const lines: string[] = [];

  lines.push('Hybrid Data Sync - User Positions');
  lines.push('='.repeat(80));
  lines.push('');

  // Summary
  lines.push('SYNC SUMMARY:');
  lines.push(`  Total Positions: ${summary.totalPositions}`);
  lines.push(`  Active: ${summary.activePositions} | Closed: ${summary.closedPositions}`);
  lines.push(`  Database Sources: ${summary.databasePositions}`);
  lines.push(`  Blockchain Sources: ${summary.blockchainPositions}`);
  lines.push(`  Merged (Both Sources): ${summary.mergedPositions}`);
  lines.push('');

  if (positions.length === 0) {
    lines.push('No positions found.');
    return lines.join('\n');
  }

  const activePositions = positions.filter((p) => p.status === 'active');
  const closedPositions = positions.filter((p) => p.status === 'closed');

  // Active positions
  if (activePositions.length > 0) {
    lines.push('ACTIVE POSITIONS (Real-time Data):');
    lines.push('-'.repeat(80));

    activePositions.forEach((pos, idx) => {
      lines.push(`\n${idx + 1}. Position: ${pos.positionId.slice(0, 8)}...${pos.positionId.slice(-6)}`);
      lines.push(`   Pool: ${pos.poolAddress.slice(0, 8)}...${pos.poolAddress.slice(-6)}`);
      lines.push(`   Source: ${pos.source.toUpperCase()}`);
      lines.push('');

      lines.push('   Liquidity:');
      lines.push(`     ${pos.tokenX.amount.toFixed(8)} ${pos.tokenX.symbol} ($${pos.tokenX.usdValue.toFixed(2)})`);
      lines.push(`     ${pos.tokenY.amount.toFixed(4)} ${pos.tokenY.symbol} ($${pos.tokenY.usdValue.toFixed(2)})`);
      lines.push(`     Total: $${pos.totalLiquidityUSD.toFixed(2)}`);
      lines.push('');

      lines.push('   Unclaimed Fees:');
      lines.push(`     ${pos.fees.tokenX.toFixed(8)} ${pos.tokenX.symbol}`);
      lines.push(`     ${pos.fees.tokenY.toFixed(4)} ${pos.tokenY.symbol}`);
      lines.push(`     Total: $${pos.fees.totalUSD.toFixed(4)}`);

      if (pos.fees.claimed.totalUSD > 0) {
        lines.push(`   Claimed Fees: $${pos.fees.claimed.totalUSD.toFixed(4)}`);
      }
      lines.push('');

      if (pos.health) {
        const healthSymbol =
          pos.health.status === 'healthy' ? '✓' :
          pos.health.status === 'at-edge' ? '!' : '✗';

        lines.push(`   Health: [${healthSymbol}] ${pos.health.status.toUpperCase()}`);
        lines.push(`   In Range: ${pos.health.isInRange ? 'Yes' : 'No'}`);

        if (!pos.health.isInRange) {
          lines.push(`   WARNING: Position is ${pos.health.distanceFromActiveBin} bins out of range!`);
        } else if (pos.health.status === 'at-edge') {
          lines.push(`   NOTICE: Position is ${pos.health.distanceFromActiveBin} bins from edge`);
        }
      }

      const holdingDays = Math.floor(
        (Date.now() - new Date(pos.entryDate).getTime()) / (1000 * 60 * 60 * 24)
      );
      lines.push(`   Holding: ${holdingDays} days (since ${new Date(pos.entryDate).toLocaleDateString()})`);

      if (pos.entryBin !== null) {
        lines.push(`   Entry Bin: ${pos.entryBin}`);
      }
    });
  }

  // Closed positions
  if (closedPositions.length > 0) {
    lines.push('\n\nCLOSED POSITIONS (Historical Data):');
    lines.push('-'.repeat(80));

    closedPositions.forEach((pos, idx) => {
      lines.push(`\n${idx + 1}. Position: ${pos.positionId.slice(0, 8)}...${pos.positionId.slice(-6)}`);
      lines.push(`   Pool: ${pos.poolAddress.slice(0, 8)}...${pos.poolAddress.slice(-6)}`);

      if (pos.pnl) {
        const pnlSign = pos.pnl.usd >= 0 ? '+' : '';
        lines.push(`   PnL: ${pnlSign}$${pos.pnl.usd.toFixed(2)} (${pnlSign}${pos.pnl.percent.toFixed(2)}%)`);
      }

      lines.push(`   Fees Earned: $${pos.fees.totalUSD.toFixed(4)}`);

      if (pos.exitDate) {
        const holdingPeriod = Math.floor(
          (new Date(pos.exitDate).getTime() - new Date(pos.entryDate).getTime()) /
            (1000 * 60 * 60 * 24)
        );
        lines.push(`   Held: ${holdingPeriod} days`);
        lines.push(`   Closed: ${new Date(pos.exitDate).toLocaleDateString()}`);
      }

      if (pos.entryBin !== null && pos.exitBin !== null) {
        lines.push(`   Bin Range: ${pos.entryBin} -> ${pos.exitBin}`);
      }
    });

    lines.push('');
  }

  lines.push('');
  lines.push('-'.repeat(80));
  lines.push(`Data synced at: ${new Date().toLocaleString()}`);

  return lines.join('\n');
}

/**
 * Formats error for tool response
 * @param error - The error
 * @returns Formatted error message
 */
export function formatSyncPositionsError(error: unknown): string {
  return `Failed to fetch positions with hybrid sync.\n\n${formatError(error)}\n\nPlease check the wallet address and try again.`;
}
