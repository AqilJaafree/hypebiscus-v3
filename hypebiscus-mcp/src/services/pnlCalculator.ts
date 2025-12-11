// Production-grade PnL Calculator using Option B (SDK pre-calculated totals)
// Based on Meteora DLMM best practices

import { Connection, PublicKey } from '@solana/web3.js';
import DLMM from '@meteora-ag/dlmm';
import { logger } from '../config.js';
import { priceApi } from './priceApi.js';
import { prisma } from './database.js';
import { TOKEN_MINTS } from '../tools/types.js';
import type {
  PositionPnLResult,
  PositionSnapshot,
  FeesBreakdown,
  RewardInfo,
  ImpermanentLoss,
  TransactionRecord,
} from '../types/pnl.js';

/**
 * Calculate position PnL using production-grade formula
 * Option B: Uses SDK's pre-calculated totalXAmount and totalYAmount
 *
 * For CLOSED positions (Realized PnL):
 * PnL = (Value withdrawn + Fees claimed + Rewards claimed) - Value deposited at deposit prices
 *
 * For OPEN positions (Unrealized PnL):
 * PnL = (Current value + Unclaimed fees + Unclaimed rewards) - Value deposited
 */
export async function calculatePositionPnL(
  positionId: string,
  connection: Connection
): Promise<PositionPnLResult> {
  logger.info(`[PnL Calculator] Calculating PnL for position: ${positionId}`);

  // Step 1: Get position from database (historical data)
  const dbPosition = await prisma.positions.findUnique({
    where: { positionId },
  });

  if (!dbPosition) {
    throw new Error(`Position ${positionId} not found in database`);
  }

  const isOpen = dbPosition.isActive;
  logger.info(`[PnL Calculator] Position status: ${isOpen ? 'OPEN' : 'CLOSED'}`);

  // Step 2: Get deposit data (cached at creation time)
  const depositData = await getDepositData(dbPosition);
  const depositValueUsd = depositData.tokenX.usdValue + depositData.tokenY.usdValue;

  logger.info(`[PnL Calculator] Deposit value: $${depositValueUsd.toFixed(2)}`);

  // Step 3: Get current/withdrawal data
  let currentData: PositionSnapshot;
  let currentValueUsd: number;

  if (isOpen) {
    // OPEN POSITION: Get current value using SDK totals (Option B)
    currentData = await getCurrentValue(
      connection,
      positionId,
      dbPosition.poolAddress
    );
    currentValueUsd = currentData.tokenX.usdValue + currentData.tokenY.usdValue;
  } else {
    // CLOSED POSITION: Use stored withdrawal data
    currentData = getWithdrawalValue(dbPosition);
    currentValueUsd = currentData.tokenX.usdValue + currentData.tokenY.usdValue;
  }

  logger.info(`[PnL Calculator] Current value: $${currentValueUsd.toFixed(2)}`);

  // Step 4: Calculate fees
  const feesData = await calculateFees(connection, positionId, dbPosition, isOpen);
  const totalFeesUsd =
    feesData.tokenX.claimedUsd +
    feesData.tokenX.unclaimedUsd +
    feesData.tokenY.claimedUsd +
    feesData.tokenY.unclaimedUsd;

  logger.info(`[PnL Calculator] Total fees: $${totalFeesUsd.toFixed(2)}`);

  // Step 5: Calculate rewards (most pools don't have active rewards yet)
  const rewardsData = await calculateRewards(connection, positionId, isOpen);
  const totalRewardsUsd = rewardsData.reduce((sum, r) => sum + r.usdValue, 0);

  logger.info(`[PnL Calculator] Total rewards: $${totalRewardsUsd.toFixed(2)}`);

  // Step 6: Calculate Impermanent Loss
  const impermanentLoss = calculateImpermanentLoss(depositData, currentData);

  logger.info(
    `[PnL Calculator] Impermanent Loss: $${impermanentLoss.usd.toFixed(2)} (${impermanentLoss.percent.toFixed(2)}%)`
  );

  // Step 7: Calculate final PnL (production formula)
  // PnL = Current Value + Fees + Rewards - Deposit Value
  const realizedPnlUsd = currentValueUsd + totalFeesUsd + totalRewardsUsd - depositValueUsd;
  const realizedPnlPercent = depositValueUsd > 0 ? (realizedPnlUsd / depositValueUsd) * 100 : 0;

  logger.info(
    `[PnL Calculator] Final PnL: $${realizedPnlUsd.toFixed(2)} (${realizedPnlPercent.toFixed(2)}%)`
  );

  return {
    positionId,
    status: isOpen ? 'open' : 'closed',
    depositValueUsd,
    currentValueUsd,
    realizedPnlUsd,
    realizedPnlPercent,
    impermanentLoss,
    feesEarnedUsd: totalFeesUsd,
    rewardsEarnedUsd: totalRewardsUsd,
    deposit: depositData,
    current: currentData,
    fees: feesData,
    rewards: rewardsData,
  };
}

/**
 * Get deposit data with prices at deposit time
 */
async function getDepositData(dbPosition: any): Promise<PositionSnapshot> {
  // Use stored deposit prices if available, otherwise use entryPrice as fallback
  const depositTokenXPrice = Number(dbPosition.depositTokenXPrice || dbPosition.entryPrice || 0);

  // For SOL price, we need to fetch if not stored
  let depositTokenYPrice = Number(dbPosition.depositTokenYPrice || 0);

  if (!depositTokenYPrice || depositTokenYPrice === 0) {
    // Fetch current SOL price as approximation for old positions
    const solPrice = await priceApi.getSolPrice();
    depositTokenYPrice = solPrice.price;
  }

  const tokenXAmount = Number(dbPosition.zbtcAmount);
  const tokenYAmount = Number(dbPosition.solAmount);

  return {
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
  };
}

/**
 * Get current value for OPEN positions using SDK totals (Option B - Simplified)
 * Uses totalXAmount and totalYAmount that SDK pre-calculates for us
 */
async function getCurrentValue(
  connection: Connection,
  positionId: string,
  poolAddress: string
): Promise<PositionSnapshot> {
  logger.info(`[PnL Calculator] Getting current value using SDK totals (Option B)`);

  // Create DLMM pool instance
  const dlmmPool = await DLMM.create(connection, new PublicKey(poolAddress));

  // Get position data
  const positionPubkey = new PublicKey(positionId);
  const position = await dlmmPool.getPosition(positionPubkey);

  // ════════════════════════════════════════════════════════════════
  // OPTION B: Use SDK's pre-calculated totals
  // The SDK already analyzed all bins and summed up the amounts for us!
  // ════════════════════════════════════════════════════════════════
  const currentZbtc = Number(position.positionData.totalXAmount) / 1e8; // zBTC has 8 decimals
  const currentSol = Number(position.positionData.totalYAmount) / 1e9; // SOL has 9 decimals

  logger.info(
    `[PnL Calculator] Current amounts from SDK: ${currentZbtc.toFixed(8)} zBTC, ${currentSol.toFixed(4)} SOL`
  );

  // Get current prices
  const prices = await priceApi.getMultiplePrices([
    { symbol: 'zBTC', address: TOKEN_MINTS.zBTC },
    { symbol: 'SOL', address: TOKEN_MINTS.SOL },
  ]);

  const zbtcPrice = prices.get('zBTC')?.price || 0;
  const solPrice = prices.get('SOL')?.price || 0;

  logger.info(`[PnL Calculator] Current prices: zBTC=$${zbtcPrice.toFixed(2)}, SOL=$${solPrice.toFixed(2)}`);

  return {
    tokenX: {
      amount: currentZbtc,
      price: zbtcPrice,
      usdValue: currentZbtc * zbtcPrice,
    },
    tokenY: {
      amount: currentSol,
      price: solPrice,
      usdValue: currentSol * solPrice,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get withdrawal value for CLOSED positions
 */
function getWithdrawalValue(dbPosition: any): PositionSnapshot {
  const tokenXAmount = Number(dbPosition.zbtcReturned || 0);
  const tokenYAmount = Number(dbPosition.solReturned || 0);

  const withdrawTokenXPrice = Number(
    dbPosition.withdrawTokenXPrice || dbPosition.exitPrice || dbPosition.entryPrice || 0
  );
  const withdrawTokenYPrice = Number(dbPosition.withdrawTokenYPrice || 0);

  return {
    tokenX: {
      amount: tokenXAmount,
      price: withdrawTokenXPrice,
      usdValue: tokenXAmount * withdrawTokenXPrice,
    },
    tokenY: {
      amount: tokenYAmount,
      price: withdrawTokenYPrice,
      usdValue: tokenYAmount * withdrawTokenYPrice,
    },
    timestamp: dbPosition.closedAt?.toISOString() || new Date().toISOString(),
  };
}

/**
 * Calculate fees with historical claims tracking
 */
async function calculateFees(
  connection: Connection,
  positionId: string,
  dbPosition: any,
  isOpen: boolean
): Promise<FeesBreakdown> {
  // Get historical fee claims from transactions table
  const feeClaimTxs = await prisma.position_transactions.findMany({
    where: {
      positionId,
      transactionType: 'fee_claim',
    },
    orderBy: {
      timestamp: 'asc',
    },
  });

  let claimedFeesUsdX = 0;
  let claimedFeesUsdY = 0;

  // Sum up all historical claims (valued at claim time prices)
  for (const tx of feeClaimTxs) {
    claimedFeesUsdX += Number(tx.tokenXAmount) * Number(tx.tokenXPrice);
    claimedFeesUsdY += Number(tx.tokenYAmount) * Number(tx.tokenYPrice);
  }

  // Get unclaimed fees
  let unclaimedTokenX = 0;
  let unclaimedTokenY = 0;
  let unclaimedUsdX = 0;
  let unclaimedUsdY = 0;

  if (isOpen) {
    // Fetch from blockchain using SDK
    const dlmmPool = await DLMM.create(connection, new PublicKey(dbPosition.poolAddress));
    const positionPubkey = new PublicKey(positionId);
    const position = await dlmmPool.getPosition(positionPubkey);

    // Get unclaimed fees from SDK
    unclaimedTokenX = Number(position.positionData.feeX) / 1e8;
    unclaimedTokenY = Number(position.positionData.feeY) / 1e9;

    // Value at current prices
    const prices = await priceApi.getMultiplePrices([
      { symbol: 'zBTC', address: TOKEN_MINTS.zBTC },
      { symbol: 'SOL', address: TOKEN_MINTS.SOL },
    ]);

    unclaimedUsdX = unclaimedTokenX * (prices.get('zBTC')?.price || 0);
    unclaimedUsdY = unclaimedTokenY * (prices.get('SOL')?.price || 0);
  } else {
    // For closed positions, use stored fees (approximation)
    unclaimedTokenX = Number(dbPosition.zbtcFees || 0);
    unclaimedTokenY = Number(dbPosition.solFees || 0);

    // Value at close time prices
    const xPrice = Number(dbPosition.withdrawTokenXPrice || dbPosition.exitPrice || 0);
    const yPrice = Number(dbPosition.withdrawTokenYPrice || 0);

    unclaimedUsdX = unclaimedTokenX * xPrice;
    unclaimedUsdY = unclaimedTokenY * yPrice;
  }

  return {
    tokenX: {
      amount: unclaimedTokenX,
      claimedUsd: claimedFeesUsdX,
      unclaimedUsd: unclaimedUsdX,
    },
    tokenY: {
      amount: unclaimedTokenY,
      claimedUsd: claimedFeesUsdY,
      unclaimedUsd: unclaimedUsdY,
    },
  };
}

/**
 * Calculate rewards (most DLMM pools don't have active rewards yet)
 *
 * @note Currently returns empty array as most DLMM pools don't have active rewards.
 *
 * Future implementation requirements when Meteora activates reward programs:
 * 1. Query reward accounts from DLMM pool
 * 2. Fetch unclaimed reward amounts using Meteora SDK
 * 3. Get reward token prices from price API
 * 4. Calculate USD values for rewards
 * 5. Track historical claims in position_transactions table
 */
async function calculateRewards(
  _connection: Connection,
  _positionId: string,
  _isOpen: boolean
): Promise<RewardInfo[]> {
  // Most DLMM pools don't have active reward programs as of 2025
  // This function stub is ready for future implementation
  return [];
}

/**
 * Calculate Impermanent Loss
 * IL = (Deposit amounts × current prices) - (Current amounts × current prices)
 *
 * This shows what you would have if you just held (HODL) vs what you have in the position
 */
function calculateImpermanentLoss(
  depositData: PositionSnapshot,
  currentData: PositionSnapshot
): ImpermanentLoss {
  // What you would have if you just held (HODL value)
  const hodlValue =
    depositData.tokenX.amount * currentData.tokenX.price +
    depositData.tokenY.amount * currentData.tokenY.price;

  // What you actually have in the position
  const positionValue = currentData.tokenX.usdValue + currentData.tokenY.usdValue;

  // IL = HODL - Position (positive IL means you lost value due to IL)
  const ilUsd = hodlValue - positionValue;

  const depositValueUsd = depositData.tokenX.usdValue + depositData.tokenY.usdValue;
  const ilPercent = depositValueUsd > 0 ? (ilUsd / depositValueUsd) * 100 : 0;

  return {
    usd: ilUsd,
    percent: ilPercent,
  };
}

/**
 * Record a transaction for historical tracking
 */
export async function recordTransaction(transaction: TransactionRecord): Promise<void> {
  await prisma.position_transactions.create({
    data: {
      positionId: transaction.positionId,
      transactionType: transaction.type,
      timestamp: transaction.timestamp,
      signature: transaction.signature,
      tokenXAmount: transaction.tokenXAmount,
      tokenYAmount: transaction.tokenYAmount,
      tokenXPrice: transaction.tokenXPrice,
      tokenYPrice: transaction.tokenYPrice,
      usdValue: transaction.usdValue,
      notes: transaction.notes,
    },
  });

  logger.info(`[PnL Calculator] Recorded transaction: ${transaction.type} for ${transaction.positionId}`);
}
