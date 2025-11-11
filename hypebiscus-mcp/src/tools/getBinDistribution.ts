// Tool: get_bin_distribution - Current bin liquidity distribution
import { config, logger } from '../config.js';
import { dlmmService } from '../services/dlmmService.js';
import { withErrorHandling, formatError } from '../utils/errors.js';

interface BinDistributionInput {
  poolAddress?: string;
  rangeSize?: number;
  includeEmptyBins?: boolean;
}

interface BinDistributionOutput {
  poolAddress: string;
  activeBinId: number;
  currentPrice: number;
  rangeQueried: {
    from: number;
    to: number;
    size: number;
  };
  bins: Array<{
    binId: number;
    price: number;
    xAmount: number;
    yAmount: number;
    liquidityUSD: number;
    isActive: boolean;
    distanceFromActive: number;
  }>;
  statistics: {
    totalBinsWithLiquidity: number;
    totalLiquidityUSD: number;
    averageLiquidityPerBin: number;
    maxLiquidityBin: {
      binId: number;
      liquidityUSD: number;
    };
    liquidityDistribution: {
      below: number; // % of liquidity below active bin
      active: number; // % of liquidity in active bin
      above: number; // % of liquidity above active bin
    };
  };
  timestamp: string;
}

/**
 * Gets bin distribution around active bin
 * @param input - Pool address and range parameters
 * @returns Bin distribution data
 */
export async function getBinDistribution(
  input: BinDistributionInput
): Promise<BinDistributionOutput> {
  return withErrorHandling(async () => {
    const {
      poolAddress = config.defaultPoolAddress,
      rangeSize = 50,
      includeEmptyBins = false,
    } = input;

    logger.info(`Fetching bin distribution for ${poolAddress} (range: ${rangeSize})`);

    // Validate range size
    if (rangeSize < 1 || rangeSize > 200) {
      throw new Error('Range size must be between 1 and 200');
    }

    // Get pool status first
    const poolStatus = await dlmmService.getPoolStatus(poolAddress);
    const activeBinId = poolStatus.activeBinId;

    // Get bin distribution
    const distributions = await dlmmService.getBinDistribution(poolAddress, rangeSize);

    // Filter empty bins if requested
    const filteredBins = includeEmptyBins
      ? distributions
      : distributions.filter((bin) => bin.liquidityUSD > 0.01);

    // Calculate statistics
    const totalLiquidityUSD = filteredBins.reduce((sum, bin) => sum + bin.liquidityUSD, 0);
    const avgLiquidityPerBin =
      filteredBins.length > 0 ? totalLiquidityUSD / filteredBins.length : 0;

    const maxLiquidityBin = filteredBins.reduce(
      (max, bin) => (bin.liquidityUSD > max.liquidityUSD ? bin : max),
      { binId: 0, liquidityUSD: 0 }
    );

    // Calculate liquidity distribution
    let liquidityBelow = 0;
    let liquidityActive = 0;
    let liquidityAbove = 0;

    for (const bin of filteredBins) {
      if (bin.binId < activeBinId) {
        liquidityBelow += bin.liquidityUSD;
      } else if (bin.binId === activeBinId) {
        liquidityActive += bin.liquidityUSD;
      } else {
        liquidityAbove += bin.liquidityUSD;
      }
    }

    const liquidityDistribution = {
      below: totalLiquidityUSD > 0 ? (liquidityBelow / totalLiquidityUSD) * 100 : 0,
      active: totalLiquidityUSD > 0 ? (liquidityActive / totalLiquidityUSD) * 100 : 0,
      above: totalLiquidityUSD > 0 ? (liquidityAbove / totalLiquidityUSD) * 100 : 0,
    };

    // Map bins with additional metadata
    const outputBins = filteredBins.map((bin) => ({
      binId: bin.binId,
      price: bin.price,
      xAmount: bin.xAmount,
      yAmount: bin.yAmount,
      liquidityUSD: bin.liquidityUSD,
      isActive: bin.binId === activeBinId,
      distanceFromActive: Math.abs(bin.binId - activeBinId),
    }));

    const output: BinDistributionOutput = {
      poolAddress,
      activeBinId,
      currentPrice: poolStatus.currentPrice,
      rangeQueried: {
        from: activeBinId - rangeSize,
        to: activeBinId + rangeSize,
        size: rangeSize * 2 + 1,
      },
      bins: outputBins,
      statistics: {
        totalBinsWithLiquidity: filteredBins.length,
        totalLiquidityUSD,
        averageLiquidityPerBin: avgLiquidityPerBin,
        maxLiquidityBin: {
          binId: maxLiquidityBin.binId,
          liquidityUSD: maxLiquidityBin.liquidityUSD,
        },
        liquidityDistribution,
      },
      timestamp: new Date().toISOString(),
    };

    logger.info(
      `Bin distribution: ${output.statistics.totalBinsWithLiquidity} bins with liquidity, $${totalLiquidityUSD.toFixed(2)} total`
    );

    return output;
  }, 'fetch bin distribution');
}

/**
 * Formats bin distribution output as human-readable string
 * @param distribution - Bin distribution data
 * @returns Formatted string
 */
export function formatBinDistribution(distribution: BinDistributionOutput): string {
  const lines: string[] = [];

  lines.push(`Bin Distribution Analysis`);
  lines.push(`Pool: ${distribution.poolAddress}`);
  lines.push('');

  lines.push('Pool Status:');
  lines.push(`  Active Bin ID: ${distribution.activeBinId}`);
  lines.push(`  Current Price: $${distribution.currentPrice.toFixed(2)}`);
  lines.push('');

  lines.push('Range Queried:');
  lines.push(
    `  From Bin: ${distribution.rangeQueried.from} to ${distribution.rangeQueried.to} (${distribution.rangeQueried.size} bins)`
  );
  lines.push('');

  lines.push('Statistics:');
  lines.push(`  Bins with Liquidity: ${distribution.statistics.totalBinsWithLiquidity}`);
  lines.push(
    `  Total Liquidity: $${distribution.statistics.totalLiquidityUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  );
  lines.push(
    `  Avg Liquidity/Bin: $${distribution.statistics.averageLiquidityPerBin.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  );
  lines.push(
    `  Max Liquidity Bin: ${distribution.statistics.maxLiquidityBin.binId} ($${distribution.statistics.maxLiquidityBin.liquidityUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
  );
  lines.push('');

  lines.push('Liquidity Distribution:');
  lines.push(
    `  Below Active: ${distribution.statistics.liquidityDistribution.below.toFixed(1)}%`
  );
  lines.push(
    `  Active Bin: ${distribution.statistics.liquidityDistribution.active.toFixed(1)}%`
  );
  lines.push(
    `  Above Active: ${distribution.statistics.liquidityDistribution.above.toFixed(1)}%`
  );
  lines.push('');

  // Show top bins by liquidity
  const topBins = [...distribution.bins]
    .sort((a, b) => b.liquidityUSD - a.liquidityUSD)
    .slice(0, 10);

  if (topBins.length > 0) {
    lines.push('Top Bins by Liquidity:');
    topBins.forEach((bin, index) => {
      const marker = bin.isActive ? ' (ACTIVE)' : '';
      lines.push(
        `  ${index + 1}. Bin ${bin.binId}${marker}: $${bin.liquidityUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} at price $${bin.price.toFixed(2)}`
      );
    });
    lines.push('');
  }

  // Show bins around active price
  const nearbyBins = distribution.bins
    .filter((bin) => bin.distanceFromActive <= 5)
    .sort((a, b) => a.binId - b.binId);

  if (nearbyBins.length > 0) {
    lines.push('Bins Near Active Price (±5 bins):');
    nearbyBins.forEach((bin) => {
      const marker = bin.isActive ? ' (ACTIVE)' : '';
      lines.push(
        `  Bin ${bin.binId}${marker}: $${bin.liquidityUSD.toFixed(2)} liquidity, ${bin.xAmount.toFixed(6)} zBTC, ${bin.yAmount.toFixed(6)} SOL`
      );
    });
    lines.push('');
  }

  // Analysis and recommendations
  lines.push('Analysis:');
  const { liquidityDistribution } = distribution.statistics;

  if (liquidityDistribution.below > 60) {
    lines.push(
      '  Most liquidity is below active price. Price may be under selling pressure.'
    );
  } else if (liquidityDistribution.above > 60) {
    lines.push('  Most liquidity is above active price. Price may face resistance to move up.');
  } else {
    lines.push('  Liquidity is well-balanced around active price. Good market depth.');
  }

  if (liquidityDistribution.active > 30) {
    lines.push('  High concentration in active bin. Expect high trading fees.');
  } else if (liquidityDistribution.active < 5) {
    lines.push('  Low liquidity in active bin. May experience higher slippage.');
  }

  lines.push('');
  lines.push(`Last Updated: ${new Date(distribution.timestamp).toLocaleString()}`);

  return lines.join('\n');
}

/**
 * Formats error for tool response
 * @param error - The error
 * @returns Formatted error message
 */
export function formatBinDistributionError(error: unknown): string {
  return `Failed to fetch bin distribution.\n\n${formatError(error)}\n\nPlease check the pool address and try again.`;
}
