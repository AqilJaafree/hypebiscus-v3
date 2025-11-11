// Tool: get_dlmm_position - Real-time on-chain position data
import { logger } from '../config.js';
import { dlmmService } from '../services/dlmmService.js';
import { priceApi } from '../services/priceApi.js';
import { withErrorHandling, formatError } from '../utils/errors.js';
import { ErrorType, HypebiscusMCPError } from './types.js';

interface DlmmPositionInput {
  positionId: string;
  poolAddress?: string;
  includePriceData?: boolean;
}

interface DlmmPositionOutput {
  positionId: string;
  poolAddress: string;
  owner: string;
  status: 'active' | 'closed';
  binCount: number;
  range: {
    min: number;
    max: number;
    span: number;
  };
  liquidity: {
    tokenX: {
      amount: number;
      symbol: string;
      usdValue?: number;
    };
    tokenY: {
      amount: number;
      symbol: string;
      usdValue?: number;
    };
    totalUSD?: number;
  };
  poolStatus: {
    activeBinId: number;
    currentPrice: number;
    binStep: number;
  };
  positionHealth: {
    isInRange: boolean;
    distanceFromActiveBin: number;
    positionStatus: 'healthy' | 'at-edge' | 'out-of-range';
  };
  bins?: Array<{
    binId: number;
    xAmount: number;
    yAmount: number;
    price: number;
  }>;
  timestamp: string;
}

/**
 * Gets real-time on-chain position data from DLMM pool
 * @param input - Position ID and optional parameters
 * @returns Position details with current status
 */
export async function getDlmmPosition(input: DlmmPositionInput): Promise<DlmmPositionOutput> {
  return withErrorHandling(async () => {
    const { positionId, poolAddress, includePriceData = true } = input;

    logger.info(`Fetching DLMM position: ${positionId}`);

    // Fetch position details
    const position = await dlmmService.getPositionDetails(positionId, poolAddress);

    if (!position) {
      throw new HypebiscusMCPError(
        ErrorType.NOT_FOUND,
        'Position not found',
        `Position ${positionId} does not exist or has been closed`
      );
    }

    // Fetch pool status
    const poolStatus = await dlmmService.getPoolStatus(position.poolAddress);

    // Determine position health
    const activeBinId = poolStatus.activeBinId;
    const { minBinId, maxBinId } = position;

    let distanceFromActiveBin = 0;
    let isInRange = true;
    let positionStatus: 'healthy' | 'at-edge' | 'out-of-range' = 'healthy';

    if (activeBinId < minBinId) {
      distanceFromActiveBin = minBinId - activeBinId;
      isInRange = false;
      positionStatus = 'out-of-range';
    } else if (activeBinId > maxBinId) {
      distanceFromActiveBin = activeBinId - maxBinId;
      isInRange = false;
      positionStatus = 'out-of-range';
    } else {
      // Check if at edge (within 10% of range)
      const rangeSize = maxBinId - minBinId;
      const edgeThreshold = Math.max(3, Math.floor(rangeSize * 0.1));

      if (activeBinId - minBinId <= edgeThreshold || maxBinId - activeBinId <= edgeThreshold) {
        positionStatus = 'at-edge';
        distanceFromActiveBin = Math.min(activeBinId - minBinId, maxBinId - activeBinId);
      }
    }

    // Determine token symbols (simplified - assumes zBTC-SOL)
    const tokenXSymbol = 'zBTC';
    const tokenYSymbol = 'SOL';

    // Build output
    const output: DlmmPositionOutput = {
      positionId,
      poolAddress: position.poolAddress,
      owner: position.owner,
      status: 'active',
      binCount: position.binCount,
      range: {
        min: minBinId,
        max: maxBinId,
        span: position.range,
      },
      liquidity: {
        tokenX: {
          amount: position.totalXAmount,
          symbol: tokenXSymbol,
        },
        tokenY: {
          amount: position.totalYAmount,
          symbol: tokenYSymbol,
        },
      },
      poolStatus: {
        activeBinId: poolStatus.activeBinId,
        currentPrice: poolStatus.currentPrice,
        binStep: poolStatus.binStep,
      },
      positionHealth: {
        isInRange,
        distanceFromActiveBin,
        positionStatus,
      },
      timestamp: new Date().toISOString(),
    };

    // Add price data if requested
    if (includePriceData) {
      try {
        const prices = await priceApi.getMultiplePrices([
          { symbol: tokenXSymbol },
          { symbol: tokenYSymbol },
        ]);

        const xPrice = prices.get(tokenXSymbol)?.price || 0;
        const yPrice = prices.get(tokenYSymbol)?.price || 0;

        output.liquidity.tokenX.usdValue = position.totalXAmount * xPrice;
        output.liquidity.tokenY.usdValue = position.totalYAmount * yPrice;
        output.liquidity.totalUSD =
          (output.liquidity.tokenX.usdValue || 0) + (output.liquidity.tokenY.usdValue || 0);

        logger.debug(`Added price data: X=$${xPrice}, Y=$${yPrice}`);
      } catch (error) {
        logger.warn('Failed to fetch price data:', error);
      }
    }

    // Add bin details if position is small enough
    if (position.bins.length <= 20) {
      output.bins = position.bins.map((bin) => ({
        binId: bin.binId,
        xAmount: parseFloat(bin.positionXAmount || '0'),
        yAmount: parseFloat(bin.positionYAmount || '0'),
        price: parseFloat(bin.pricePerToken),
      }));
    }

    logger.info(
      `Position ${positionId}: ${output.positionHealth.positionStatus}, ${output.binCount} bins, range ${minBinId}-${maxBinId}`
    );

    return output;
  }, 'fetch DLMM position');
}

/**
 * Formats DLMM position output as human-readable string
 * @param position - Position data
 * @returns Formatted string
 */
export function formatDlmmPosition(position: DlmmPositionOutput): string {
  const lines: string[] = [];

  lines.push(`DLMM Position: ${position.positionId}`);
  lines.push(`Pool: ${position.poolAddress}`);
  lines.push(`Owner: ${position.owner}`);
  lines.push(`Status: ${position.status.toUpperCase()}`);
  lines.push('');

  lines.push('Position Range:');
  lines.push(`  Min Bin: ${position.range.min}`);
  lines.push(`  Max Bin: ${position.range.max}`);
  lines.push(`  Range Span: ${position.range.span} bins`);
  lines.push(`  Total Bins: ${position.binCount}`);
  lines.push('');

  lines.push('Liquidity:');
  lines.push(
    `  ${position.liquidity.tokenX.symbol}: ${position.liquidity.tokenX.amount.toFixed(6)}${
      position.liquidity.tokenX.usdValue
        ? ` ($${position.liquidity.tokenX.usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
        : ''
    }`
  );
  lines.push(
    `  ${position.liquidity.tokenY.symbol}: ${position.liquidity.tokenY.amount.toFixed(6)}${
      position.liquidity.tokenY.usdValue
        ? ` ($${position.liquidity.tokenY.usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
        : ''
    }`
  );
  if (position.liquidity.totalUSD) {
    lines.push(
      `  Total Value: $${position.liquidity.totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    );
  }
  lines.push('');

  lines.push('Pool Status:');
  lines.push(`  Active Bin: ${position.poolStatus.activeBinId}`);
  lines.push(`  Current Price: $${position.poolStatus.currentPrice.toFixed(2)}`);
  lines.push(`  Bin Step: ${position.poolStatus.binStep}`);
  lines.push('');

  lines.push('Position Health:');
  const healthEmoji =
    position.positionHealth.positionStatus === 'healthy'
      ? 'Healthy'
      : position.positionHealth.positionStatus === 'at-edge'
        ? 'At Edge'
        : 'Out of Range';
  lines.push(`  Status: ${healthEmoji}`);
  lines.push(`  In Range: ${position.positionHealth.isInRange ? 'Yes' : 'No'}`);
  lines.push(`  Distance from Active Bin: ${position.positionHealth.distanceFromActiveBin} bins`);

  if (!position.positionHealth.isInRange) {
    lines.push('');
    lines.push('Warning: Position is out of range and not earning fees!');
  } else if (position.positionHealth.positionStatus === 'at-edge') {
    lines.push('');
    lines.push('Notice: Position is near range edge. Monitor for potential rebalancing.');
  }

  if (position.bins && position.bins.length > 0) {
    lines.push('');
    lines.push('Bin Distribution:');
    position.bins.forEach((bin) => {
      const isActive = bin.binId === position.poolStatus.activeBinId;
      lines.push(
        `  Bin ${bin.binId}${isActive ? ' (ACTIVE)' : ''}: ${bin.xAmount.toFixed(6)} ${position.liquidity.tokenX.symbol}, ${bin.yAmount.toFixed(6)} ${position.liquidity.tokenY.symbol}`
      );
    });
  }

  lines.push('');
  lines.push(`Last Updated: ${new Date(position.timestamp).toLocaleString()}`);

  return lines.join('\n');
}

/**
 * Formats error for tool response
 * @param error - The error
 * @returns Formatted error message
 */
export function formatDlmmPositionError(error: unknown): string {
  return `Failed to fetch DLMM position.\n\n${formatError(error)}\n\nPlease check the position ID and try again.`;
}
