// Tool: close_position - Close a position with production-grade PnL tracking
import { Connection, PublicKey } from '@solana/web3.js';
import { logger, config } from '../config.js';
import { validateSolanaAddress } from '../utils/validation.js';
import { withErrorHandling, formatError } from '../utils/errors.js';
import { calculatePositionPnL, recordTransaction } from '../services/pnlCalculator.js';
import { priceApi } from '../services/priceApi.js';
import { prisma } from '../services/database.js';
import { TOKEN_MINTS } from './types.js';
import type { ClosePositionResult, TransactionRecord } from '../types/pnl.js';
import { DatabaseError, DatabaseErrorType } from '../types/database.js';

export interface ClosePositionInput {
  positionId: string;
  walletAddress: string;
  closeOnBlockchain?: boolean; // If false, just record the close in DB (position already closed on-chain)
  transactionSignature?: string; // Optional signature if position was already closed
}

/**
 * Close a position with production-grade PnL tracking
 *
 * This tool:
 * 1. Records current prices at close time
 * 2. Calculates final PnL using production formula
 * 3. Records withdrawal transaction
 * 4. Updates position in database
 * 5. Updates user stats
 *
 * @param input - Position ID, wallet address, and optional blockchain execution flag
 * @returns Close result with final PnL
 */
export async function closePosition_tool(input: ClosePositionInput): Promise<ClosePositionResult> {
  return withErrorHandling(async () => {
    const { positionId, walletAddress, closeOnBlockchain = false, transactionSignature } = input;

    // Validate inputs
    try {
      validateSolanaAddress(positionId);
      validateSolanaAddress(walletAddress);
    } catch (error) {
      throw new DatabaseError(
        DatabaseErrorType.INVALID_INPUT,
        'Invalid position ID or wallet address',
        'Both must be valid Solana public keys'
      );
    }

    logger.info(
      `[MCP Tool] Closing position ${positionId} for wallet ${walletAddress} ` +
        `(blockchain: ${closeOnBlockchain})`
    );

    const connection = new Connection(config.solanaRpcUrl, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: config.requestTimeout,
    });

    // Step 1: Get current prices BEFORE close (critical for accuracy)
    const prices = await priceApi.getMultiplePrices([
      { symbol: 'zBTC', address: TOKEN_MINTS.zBTC },
      { symbol: 'SOL', address: TOKEN_MINTS.SOL },
    ]);

    const withdrawTokenXPrice = prices.get('zBTC')?.price || 0;
    const withdrawTokenYPrice = prices.get('SOL')?.price || 0;

    logger.info(
      `[MCP Tool] Withdraw prices: zBTC=$${withdrawTokenXPrice.toFixed(2)}, SOL=$${withdrawTokenYPrice.toFixed(2)}`
    );

    // Step 2: Close position on blockchain (if requested)
    // Use null instead of empty string to avoid unique constraint violations
    let signature = transactionSignature || null;

    if (closeOnBlockchain) {
      // NOTE: This requires the user's keypair which clients (Garden Bot) will provide
      // For now, we'll just validate that the position exists and is open
      const dbPosition = await prisma.positions.findUnique({
        where: { positionId },
      });

      if (!dbPosition) {
        throw new DatabaseError(
          DatabaseErrorType.POSITION_NOT_FOUND,
          `Position ${positionId} not found`,
          'The position may have already been closed or does not exist'
        );
      }

      if (!dbPosition.isActive) {
        throw new DatabaseError(
          DatabaseErrorType.INVALID_STATE,
          `Position ${positionId} is already closed`,
          'Cannot close a position that is not active'
        );
      }

      // Blockchain close would happen here (requires keypair from client)
      // For MCP tool, we expect the client to handle blockchain interaction
      throw new DatabaseError(
        DatabaseErrorType.NOT_IMPLEMENTED,
        'Blockchain close via MCP not yet supported',
        'Please close the position via Garden Bot or Web App, then call this tool with closeOnBlockchain=false'
      );
    }

    // Step 3: Get position data to calculate withdrawn amounts
    const dbPosition = await prisma.positions.findUnique({
      where: { positionId },
    });

    if (!dbPosition) {
      throw new DatabaseError(
        DatabaseErrorType.POSITION_NOT_FOUND,
        `Position ${positionId} not found`,
        'The position does not exist in the database'
      );
    }

    // Get withdrawn amounts (from blockchain or DB)
    let withdrawnAmounts = {
      tokenX: Number(dbPosition.zbtcReturned || dbPosition.zbtcAmount),
      tokenY: Number(dbPosition.solReturned || dbPosition.solAmount),
    };

    // If position is still active, try to get actual amounts from blockchain
    if (dbPosition.isActive) {
      try {
        const DLMM = (await import('@meteora-ag/dlmm')).default;
        const dlmmPool = await DLMM.create(connection, new PublicKey(dbPosition.poolAddress));
        const position = await dlmmPool.getPosition(new PublicKey(positionId));

        // Get actual current amounts
        withdrawnAmounts = {
          tokenX: Number(position.positionData.totalXAmount) / 1e8,
          tokenY: Number(position.positionData.totalYAmount) / 1e9,
        };

        logger.info(
          `[MCP Tool] Fetched withdrawn amounts from blockchain: ` +
            `${withdrawnAmounts.tokenX.toFixed(8)} zBTC, ${withdrawnAmounts.tokenY.toFixed(4)} SOL`
        );
      } catch (error) {
        logger.warn(`[MCP Tool] Could not fetch amounts from blockchain, using DB values:`, error);
      }
    }

    // Step 4: Record withdrawal transaction
    const withdrawalTx: TransactionRecord = {
      positionId,
      type: 'withdraw',
      timestamp: new Date(),
      ...(signature && { signature }), // Only include signature if it exists
      tokenXAmount: withdrawnAmounts.tokenX,
      tokenYAmount: withdrawnAmounts.tokenY,
      tokenXPrice: withdrawTokenXPrice,
      tokenYPrice: withdrawTokenYPrice,
      usdValue:
        withdrawnAmounts.tokenX * withdrawTokenXPrice + withdrawnAmounts.tokenY * withdrawTokenYPrice,
      notes: signature ? `Closed via transaction ${signature}` : 'Closed via MCP tool',
    };

    await recordTransaction(withdrawalTx);

    logger.info(`[MCP Tool] Recorded withdrawal transaction`);

    // Step 5: Mark position as closed BEFORE calculating PnL
    // This is critical because:
    // 1. Position account is already closed on blockchain (shouldClaimAndClose=true deleted it)
    // 2. calculatePositionPnL checks isActive to decide whether to fetch from blockchain
    // 3. If we don't mark it closed first, it will try to fetch and fail with "Position account not found"
    await prisma.positions.update({
      where: { positionId },
      data: {
        isActive: false,
        closedAt: new Date(),

        // Store withdrawal data
        zbtcReturned: withdrawnAmounts.tokenX,
        solReturned: withdrawnAmounts.tokenY,
        withdrawTokenXPrice,
        withdrawTokenYPrice,

        lastChecked: new Date(),
      },
    });

    logger.info(`[MCP Tool] Position marked as closed in database`);

    // Step 6: Calculate final PnL (now it knows position is closed and will use DB values)
    const pnlResult = await calculatePositionPnL(positionId, connection);

    logger.info(
      `[MCP Tool] Final PnL calculated: $${pnlResult.realizedPnlUsd.toFixed(2)} (${pnlResult.realizedPnlPercent.toFixed(2)}%)`
    );

    // Step 7: Update position with PnL data
    await prisma.positions.update({
      where: { positionId },
      data: {
        withdrawValueUsd: pnlResult.currentValueUsd,

        // Store production-grade PnL
        realizedPnlUsd: pnlResult.realizedPnlUsd,
        realizedPnlPercent: pnlResult.realizedPnlPercent,
        impermanentLossUsd: pnlResult.impermanentLoss.usd,
        impermanentLossPercent: pnlResult.impermanentLoss.percent,
        feesEarnedUsd: pnlResult.feesEarnedUsd,
        rewardsEarnedUsd: pnlResult.rewardsEarnedUsd,

        // Legacy fields (for backward compatibility)
        exitPrice: withdrawTokenXPrice,
        pnlUsd: pnlResult.realizedPnlUsd,
        pnlPercent: pnlResult.realizedPnlPercent,
      },
    });

    logger.info(`[MCP Tool] Position updated with PnL data`);

    // Step 8: Update user stats
    await updateUserStats(dbPosition.userId);

    logger.info(`[MCP Tool] User stats updated`);

    return {
      success: true,
      positionId,
      ...(signature && { signature }), // Only include signature if it exists
      pnl: pnlResult,
    };
  }, 'close position');
}

/**
 * Update user stats after position close
 */
async function updateUserStats(userId: string): Promise<void> {
  // Get all positions for user
  const positions = await prisma.positions.findMany({
    where: { userId },
  });

  // Calculate aggregates
  const totalPositions = positions.length;
  const activePositions = positions.filter((p) => p.isActive).length;

  // Calculate totals
  const totals = positions.reduce(
    (acc, pos) => {
      acc.totalPnlUsd += Number(pos.realizedPnlUsd || 0);
      acc.totalImpermanentLossUsd += Number(pos.impermanentLossUsd || 0);
      acc.totalFeesEarnedUsd += Number(pos.feesEarnedUsd || 0);
      acc.totalRewardsEarnedUsd += Number(pos.rewardsEarnedUsd || 0);
      acc.totalZbtcFees += Number(pos.zbtcFees || 0);
      acc.totalSolFees += Number(pos.solFees || 0);

      if (pos.depositValueUsd) {
        acc.totalDeposited += Number(pos.depositValueUsd);
        acc.positionsWithDeposit++;
      }

      if (!pos.isActive && pos.closedAt && pos.createdAt) {
        const holdTime = (pos.closedAt.getTime() - pos.createdAt.getTime()) / 1000; // seconds
        acc.totalHoldTime += holdTime;
        acc.closedPositions++;
      }

      return acc;
    },
    {
      totalPnlUsd: 0,
      totalImpermanentLossUsd: 0,
      totalFeesEarnedUsd: 0,
      totalRewardsEarnedUsd: 0,
      totalZbtcFees: 0,
      totalSolFees: 0,
      totalDeposited: 0,
      positionsWithDeposit: 0,
      totalHoldTime: 0,
      closedPositions: 0,
    }
  );

  const avgPositionSize =
    totals.positionsWithDeposit > 0 ? totals.totalDeposited / totals.positionsWithDeposit : 0;
  const avgHoldTime = totals.closedPositions > 0 ? totals.totalHoldTime / totals.closedPositions : 0;

  // Upsert user stats
  await prisma.user_stats.upsert({
    where: { userId },
    create: {
      userId,
      totalPositions,
      activePositions,
      totalPnlUsd: totals.totalPnlUsd,
      totalImpermanentLossUsd: totals.totalImpermanentLossUsd,
      totalFeesEarnedUsd: totals.totalFeesEarnedUsd,
      totalRewardsEarnedUsd: totals.totalRewardsEarnedUsd,
      totalZbtcFees: totals.totalZbtcFees,
      totalSolFees: totals.totalSolFees,
      avgPositionSize,
      avgHoldTime: Math.floor(avgHoldTime),
      updatedAt: new Date(),
    },
    update: {
      totalPositions,
      activePositions,
      totalPnlUsd: totals.totalPnlUsd,
      totalImpermanentLossUsd: totals.totalImpermanentLossUsd,
      totalFeesEarnedUsd: totals.totalFeesEarnedUsd,
      totalRewardsEarnedUsd: totals.totalRewardsEarnedUsd,
      totalZbtcFees: totals.totalZbtcFees,
      totalSolFees: totals.totalSolFees,
      avgPositionSize,
      avgHoldTime: Math.floor(avgHoldTime),
      updatedAt: new Date(),
    },
  });

  logger.info(`[MCP Tool] Updated stats for user ${userId}: ${totalPositions} positions, PnL: $${totals.totalPnlUsd.toFixed(2)}`);
}

/**
 * Format close position result as human-readable string
 */
export function formatClosePositionResult(result: ClosePositionResult): string {
  const lines: string[] = [];

  lines.push('Position Closed Successfully');
  lines.push('═'.repeat(80));
  lines.push('');

  lines.push(`Position ID: ${result.positionId.slice(0, 8)}...${result.positionId.slice(-6)}`);
  if (result.signature) {
    lines.push(`Transaction: ${result.signature.slice(0, 8)}...${result.signature.slice(-6)}`);
  }
  lines.push('');

  // Quick summary
  const pnl = result.pnl;
  const pnlSign = pnl.realizedPnlUsd >= 0 ? '+' : '';
  const pnlEmoji = pnl.realizedPnlUsd >= 0 ? '📈' : '📉';

  lines.push('SUMMARY:');
  lines.push(
    `  ${pnlEmoji} Final PnL: ${pnlSign}$${pnl.realizedPnlUsd.toFixed(2)} (${pnlSign}${pnl.realizedPnlPercent.toFixed(2)}%)`
  );
  lines.push(`  💰 Fees Earned: $${pnl.feesEarnedUsd.toFixed(2)}`);
  lines.push(
    `  📊 Impermanent Loss: ${pnl.impermanentLoss.usd >= 0 ? '+' : ''}$${pnl.impermanentLoss.usd.toFixed(2)}`
  );
  lines.push('');

  lines.push('WITHDRAWN:');
  lines.push(`  ${pnl.current.tokenX.amount.toFixed(8)} zBTC ($${pnl.current.tokenX.usdValue.toFixed(2)})`);
  lines.push(`  ${pnl.current.tokenY.amount.toFixed(4)} SOL ($${pnl.current.tokenY.usdValue.toFixed(2)})`);
  lines.push(`  Total: $${pnl.currentValueUsd.toFixed(2)}`);
  lines.push('');

  lines.push('═'.repeat(80));

  return lines.join('\n');
}

/**
 * Format error for tool response
 */
export function formatClosePositionError(error: unknown): string {
  return `Failed to close position.\n\n${formatError(error)}\n\nPlease check the inputs and try again.`;
}
