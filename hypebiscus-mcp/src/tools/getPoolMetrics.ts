// Main tool: get_pool_metrics
import { config, logger } from '../config.js';
import { meteoraApi } from '../services/meteoraApi.js';
import { priceApi } from '../services/priceApi.js';
import { dbUtils } from '../services/database.js';
import { validateSolanaAddress, safeParseNumber } from '../utils/validation.js';
import { withErrorHandling, formatError } from '../utils/errors.js';
import { decimalToNumber } from '../types/database.js';
import {
  PoolMetricsInput,
  PoolMetricsOutput,
  TOKEN_DECIMALS,
} from './types.js';

/**
 * Determines token symbols from pool name
 * @param poolName - Pool name (e.g., "zBTC-SOL")
 * @returns Tuple of [tokenA, tokenB]
 */
function parsePoolName(poolName: string): [string, string] {
  const parts = poolName.split('-');
  if (parts.length >= 2) {
    return [parts[0].trim(), parts[1].trim()];
  }
  return ['Unknown', 'Unknown'];
}

/**
 * Formats amount with decimals
 * @param amount - Raw amount
 * @param decimals - Token decimals
 * @returns Formatted amount
 */
function formatAmount(amount: number | string, decimals: number): number {
  const rawAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  return rawAmount / Math.pow(10, decimals);
}

/**
 * Generates AI-friendly recommendation based on pool metrics
 * @param metrics - Pool metrics data
 * @returns Recommendation string
 */
function generateRecommendation(metrics: PoolMetricsOutput): string {
  const { apy, fees24h, volume24h } = metrics.metrics;
  const { totalUSD } = metrics.liquidity;

  const recommendations: string[] = [];

  // APY analysis
  if (apy > 20) {
    recommendations.push('High APY (>20%) indicates strong earning potential');
  } else if (apy > 10) {
    recommendations.push('Moderate APY (10-20%) offers balanced returns');
  } else if (apy > 5) {
    recommendations.push('Conservative APY (5-10%) suitable for risk-averse investors');
  } else {
    recommendations.push('Low APY (<5%) may indicate market stability but lower returns');
  }

  // Liquidity analysis
  if (totalUSD > 5_000_000) {
    recommendations.push('Deep liquidity (>$5M) ensures low slippage');
  } else if (totalUSD > 1_000_000) {
    recommendations.push('Good liquidity ($1-5M) supports moderate trading');
  } else if (totalUSD > 500_000) {
    recommendations.push('Limited liquidity ($500K-1M) may have higher slippage');
  } else {
    recommendations.push('Low liquidity (<$500K) suitable for small positions only');
  }

  // Volume analysis
  if (volume24h > 1_000_000) {
    recommendations.push('High volume (>$1M) shows strong market activity');
  } else if (volume24h > 100_000) {
    recommendations.push('Moderate volume ($100K-1M) indicates decent trading activity');
  } else {
    recommendations.push('Low volume (<$100K) suggests limited market interest');
  }

  // Fee generation
  if (fees24h > 10_000) {
    recommendations.push('Strong fee generation (>$10K/day) benefits LPs');
  } else if (fees24h > 1_000) {
    recommendations.push('Moderate fee generation ($1-10K/day)');
  }

  return recommendations.join('. ') + '.';
}

/**
 * Main function to get pool metrics
 * @param input - Pool address input with optional user context
 * @returns Pool metrics output
 */
export async function getPoolMetrics(input: PoolMetricsInput): Promise<PoolMetricsOutput> {
  return withErrorHandling(async () => {
    const { poolAddress: inputPoolAddress, userId, walletAddress } = input;
    const poolAddress = inputPoolAddress || config.defaultPoolAddress;

    logger.info(`Fetching pool metrics for ${poolAddress}${userId || walletAddress ? ' with user context' : ''}`);

    // Validate pool address
    validateSolanaAddress(poolAddress);

    // Fetch pool data from Meteora
    logger.debug('Step 1: Fetching pool data from Meteora API');
    const poolData = await meteoraApi.getPoolData(poolAddress);

    // Parse pool name to determine tokens
    const [tokenASymbol, tokenBSymbol] = parsePoolName(poolData.name);
    logger.debug(`Pool tokens: ${tokenASymbol}-${tokenBSymbol}`);

    // Determine decimals (default to known values or use 9)
    const tokenADecimals =
      TOKEN_DECIMALS[tokenASymbol as keyof typeof TOKEN_DECIMALS] || 9;
    const tokenBDecimals =
      TOKEN_DECIMALS[tokenBSymbol as keyof typeof TOKEN_DECIMALS] || 9;

    // Parse reserve amounts
    const tokenAAmount = formatAmount(poolData.reserve_x_amount, tokenADecimals);
    const tokenBAmount = formatAmount(poolData.reserve_y_amount, tokenBDecimals);

    // Fetch prices for both tokens
    logger.debug('Step 2: Fetching token prices');
    const prices = await priceApi.getMultiplePrices([
      { symbol: tokenASymbol },
      { symbol: tokenBSymbol },
    ]);

    const tokenAPrice = prices.get(tokenASymbol) || { price: 0, change24h: 0 };
    const tokenBPrice = prices.get(tokenBSymbol) || { price: 0, change24h: 0 };

    // Calculate USD values
    const tokenAUsdValue = tokenAAmount * tokenAPrice.price;
    const tokenBUsdValue = tokenBAmount * tokenBPrice.price;
    const totalLiquidityUSD = tokenAUsdValue + tokenBUsdValue;

    // Extract metrics
    const apy = safeParseNumber(poolData.apy, 0);
    const fees24h = safeParseNumber(poolData.fees_24h, 0);
    const volume24h = safeParseNumber(poolData.trade_volume_24h, 0);
    const binStep = safeParseNumber(poolData.bin_step, 0);

    // For active bin, we use current price to estimate (Meteora API doesn't provide active bin ID directly)
    // Active bin calculation would require on-chain data for precision
    const activeBinEstimate = Math.round(poolData.current_price * 100);

    logger.debug('Step 3: Assembling pool metrics');

    // Assemble response
    const output: PoolMetricsOutput = {
      poolAddress,
      poolName: poolData.name,
      liquidity: {
        totalUSD: totalLiquidityUSD,
        tokenA: {
          symbol: tokenASymbol,
          amount: tokenAAmount,
          decimals: tokenADecimals,
          usdValue: tokenAUsdValue,
        },
        tokenB: {
          symbol: tokenBSymbol,
          amount: tokenBAmount,
          decimals: tokenBDecimals,
          usdValue: tokenBUsdValue,
        },
      },
      metrics: {
        apy,
        fees24h,
        volume24h,
        binStep,
        activeBin: activeBinEstimate,
      },
      prices: {
        [tokenASymbol]: {
          usd: tokenAPrice.price,
          change24h: tokenAPrice.change24h,
        },
        [tokenBSymbol]: {
          usd: tokenBPrice.price,
          change24h: tokenBPrice.change24h,
        },
      },
      timestamp: new Date().toISOString(),
    };

    // Generate recommendation
    output.recommendation = generateRecommendation(output);

    // Add user context if provided
    if (userId || walletAddress) {
      try {
        let targetUserId = userId;

        // Look up user by wallet if needed
        if (walletAddress) {
          validateSolanaAddress(walletAddress);
          const user = await dbUtils.findUserByWallet(walletAddress);
          if (user) {
            targetUserId = user.id;
          }
        }

        if (targetUserId) {
          // Get user's positions in this pool
          const positionsInPool = await dbUtils.countActivePositionsInPool(
            targetUserId,
            poolAddress
          );

          // Get user's aggregated stats
          const userStats = await dbUtils.getUserAggregatedStats(targetUserId);

          // Calculate average performance
          const avgPerformance = userStats.stats
            ? decimalToNumber(userStats.stats.totalPnlUsd) ?? 0
            : 0;

          // Generate personalized recommendation
          let personalizedRec = '';
          if (positionsInPool > 0) {
            personalizedRec = `You currently have ${positionsInPool} active position${positionsInPool > 1 ? 's' : ''} in this pool. `;
          }

          if (userStats.stats && userStats.stats.totalPositions && userStats.stats.totalPositions > 0) {
            const totalPositions = userStats.stats.totalPositions;
            const avgPnl = avgPerformance / (totalPositions || 1);

            if (avgPnl > 0) {
              personalizedRec += `Your average performance across all positions is +$${avgPnl.toFixed(2)}. `;
            } else if (avgPnl < 0) {
              personalizedRec += `Your average performance across all positions is $${avgPnl.toFixed(2)}. Consider reviewing position sizes. `;
            }

            // Compare pool APY to user's historical performance
            if (apy > 15 && avgPnl > 0) {
              personalizedRec += 'This pool offers strong APY aligned with your positive track record.';
            } else if (apy > 15 && avgPnl < 0) {
              personalizedRec += 'While this pool offers strong APY, consider starting with a smaller position given past performance.';
            }
          } else {
            personalizedRec += 'This would be your first position. Consider starting with a conservative size to test the strategy.';
          }

          output.userContext = {
            positionsInPool,
            avgPerformance,
            personalizedRecommendation: personalizedRec,
          };

          logger.debug(`Added user context: ${positionsInPool} positions in pool`);
        }
      } catch (error) {
        // Log error but don't fail the entire request
        logger.warn('Failed to fetch user context:', error);
      }
    }

    logger.info(
      `Successfully fetched metrics for ${poolData.name}: APY ${apy.toFixed(2)}%, Liquidity $${totalLiquidityUSD.toFixed(2)}`
    );

    return output;
  }, 'fetch pool metrics');
}

/**
 * Formats pool metrics output as a human-readable string
 * @param metrics - Pool metrics
 * @returns Formatted string
 */
export function formatPoolMetrics(metrics: PoolMetricsOutput): string {
  const lines: string[] = [];

  lines.push(`Pool Metrics: ${metrics.poolName}`);
  lines.push(`Address: ${metrics.poolAddress}`);
  lines.push('');

  lines.push('Liquidity:');
  lines.push(`  Total: $${metrics.liquidity.totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  lines.push(
    `  ${metrics.liquidity.tokenA.symbol}: ${metrics.liquidity.tokenA.amount.toFixed(4)} ($${metrics.liquidity.tokenA.usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
  );
  lines.push(
    `  ${metrics.liquidity.tokenB.symbol}: ${metrics.liquidity.tokenB.amount.toFixed(4)} ($${metrics.liquidity.tokenB.usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
  );
  lines.push('');

  lines.push('Metrics:');
  lines.push(`  APY: ${metrics.metrics.apy.toFixed(2)}%`);
  lines.push(`  24h Fees: $${metrics.metrics.fees24h.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  lines.push(`  24h Volume: $${metrics.metrics.volume24h.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  lines.push(`  Bin Step: ${metrics.metrics.binStep}`);
  lines.push(`  Active Bin: ${metrics.metrics.activeBin}`);
  lines.push('');

  lines.push('Prices:');
  for (const [token, priceInfo] of Object.entries(metrics.prices)) {
    if (priceInfo) {
      const changeSign = priceInfo.change24h >= 0 ? '+' : '';
      lines.push(
        `  ${token}: $${priceInfo.usd.toFixed(2)} (${changeSign}${priceInfo.change24h.toFixed(2)}%)`
      );
    }
  }
  lines.push('');

  if (metrics.recommendation) {
    lines.push('Analysis:');
    lines.push(`  ${metrics.recommendation}`);
    lines.push('');
  }

  if (metrics.userContext) {
    lines.push('Personalized Insights:');
    lines.push(`  Positions in Pool: ${metrics.userContext.positionsInPool}`);
    lines.push(`  Your Avg Performance: $${metrics.userContext.avgPerformance.toFixed(2)}`);
    if (metrics.userContext.personalizedRecommendation) {
      lines.push(`  ${metrics.userContext.personalizedRecommendation}`);
    }
    lines.push('');
  }

  lines.push(`Last Updated: ${new Date(metrics.timestamp).toLocaleString()}`);

  return lines.join('\n');
}

/**
 * Formats error for tool response
 * @param error - The error
 * @returns Formatted error message
 */
export function formatToolError(error: unknown): string {
  return `Failed to fetch pool metrics.\n\n${formatError(error)}\n\nPlease check the pool address and try again.`;
}
