// Tool: calculate_rebalance - Optimal rebalance strategy recommendation
import { logger } from '../config.js';
import { dlmmService } from '../services/dlmmService.js';
import { withErrorHandling, formatError } from '../utils/errors.js';

interface CalculateRebalanceInput {
  positionId: string;
  poolAddress?: string;
  bufferBins?: number;
}

interface CalculateRebalanceOutput {
  positionId: string;
  poolAddress: string;
  recommendation: {
    shouldRebalance: boolean;
    priority: 'critical' | 'high' | 'medium' | 'low' | 'none';
    reason: string;
    suggestedAction: string;
  };
  currentState: {
    activeBinId: number;
    currentPrice: number;
    positionRange: {
      min: number;
      max: number;
      span: number;
    };
    distanceFromRange: number;
    isInBufferZone: boolean;
  };
  analysis: {
    positionHealth: 'healthy' | 'monitor' | 'warning' | 'critical';
    isEarningFees: boolean;
    bufferBinsRemaining: number;
    estimatedTimeToOutOfRange?: string;
  };
  suggestedNewRange?: {
    minBin: number;
    maxBin: number;
    strategy: string;
    reasoning: string;
  };
  timestamp: string;
}

/**
 * Calculates whether a position needs rebalancing and provides recommendations
 * @param input - Position ID and rebalance parameters
 * @returns Rebalance recommendation
 */
export async function calculateRebalance(
  input: CalculateRebalanceInput
): Promise<CalculateRebalanceOutput> {
  return withErrorHandling(async () => {
    const { positionId, poolAddress, bufferBins = 10 } = input;

    logger.info(`Calculating rebalance strategy for position ${positionId}`);

    // Get rebalance recommendation from service
    const recommendation = await dlmmService.calculateRebalanceNeed(
      positionId,
      poolAddress,
      bufferBins
    );

    // Get position details for additional analysis
    const position = await dlmmService.getPositionDetails(positionId, poolAddress);

    if (!position) {
      throw new Error('Position not found or already closed');
    }

    // Get pool status
    const poolStatus = await dlmmService.getPoolStatus(position.poolAddress);

    // Determine priority level
    let priority: 'critical' | 'high' | 'medium' | 'low' | 'none';
    let positionHealth: 'healthy' | 'monitor' | 'warning' | 'critical';

    if (recommendation.shouldRebalance) {
      priority = 'critical';
      positionHealth = 'critical';
    } else if (recommendation.isInBufferZone) {
      if (recommendation.distanceFromRange > bufferBins / 2) {
        priority = 'high';
        positionHealth = 'warning';
      } else {
        priority = 'medium';
        positionHealth = 'monitor';
      }
    } else {
      priority = 'none';
      positionHealth = 'healthy';
    }

    // Determine if position is earning fees
    const isEarningFees =
      poolStatus.activeBinId >= recommendation.positionRange.min &&
      poolStatus.activeBinId <= recommendation.positionRange.max;

    // Calculate buffer bins remaining
    let bufferBinsRemaining = bufferBins;
    if (recommendation.distanceFromRange > 0) {
      bufferBinsRemaining = Math.max(0, bufferBins - recommendation.distanceFromRange);
    }

    // Build output
    const output: CalculateRebalanceOutput = {
      positionId,
      poolAddress: position.poolAddress,
      recommendation: {
        shouldRebalance: recommendation.shouldRebalance,
        priority,
        reason: recommendation.reason,
        suggestedAction: recommendation.suggestedAction || 'Continue monitoring',
      },
      currentState: {
        activeBinId: recommendation.currentActiveBin,
        currentPrice: poolStatus.currentPrice,
        positionRange: {
          min: recommendation.positionRange.min,
          max: recommendation.positionRange.max,
          span: recommendation.positionRange.max - recommendation.positionRange.min,
        },
        distanceFromRange: recommendation.distanceFromRange,
        isInBufferZone: recommendation.isInBufferZone,
      },
      analysis: {
        positionHealth,
        isEarningFees,
        bufferBinsRemaining,
      },
      timestamp: new Date().toISOString(),
    };

    // Suggest new range if rebalancing is needed
    if (recommendation.shouldRebalance || priority === 'high') {
      const activeBin = poolStatus.activeBinId;

      // Suggest a range centered around active bin with similar span
      const currentSpan = recommendation.positionRange.max - recommendation.positionRange.min;
      const suggestedSpan = Math.max(currentSpan, 68); // Minimum 68 bins

      // Create range starting from active bin (one-sided strategy)
      const suggestedMinBin = activeBin;
      const suggestedMaxBin = activeBin + suggestedSpan;

      output.suggestedNewRange = {
        minBin: suggestedMinBin,
        maxBin: suggestedMaxBin,
        strategy: 'One-sided (Bid-Ask)',
        reasoning: `Position range from active bin (${activeBin}) upward for ${suggestedSpan} bins. This captures price appreciation while minimizing impermanent loss.`,
      };
    }

    logger.info(
      `Rebalance analysis: ${priority.toUpperCase()} priority, health: ${positionHealth}`
    );

    return output;
  }, 'calculate rebalance');
}

/**
 * Formats rebalance calculation output as human-readable string
 * @param result - Rebalance calculation result
 * @returns Formatted string
 */
export function formatCalculateRebalance(result: CalculateRebalanceOutput): string {
  const lines: string[] = [];

  lines.push(`Rebalance Analysis for Position: ${result.positionId}`);
  lines.push(`Pool: ${result.poolAddress}`);
  lines.push('');

  // Recommendation header with priority
  const priorityEmoji: Record<string, string> = {
    critical: 'CRITICAL',
    high: 'HIGH',
    medium: 'MEDIUM',
    low: 'LOW',
    none: 'OK',
  };

  lines.push(`PRIORITY: ${priorityEmoji[result.recommendation.priority]}`);
  lines.push(`Rebalance Needed: ${result.recommendation.shouldRebalance ? 'YES' : 'NO'}`);
  lines.push('');

  lines.push('Recommendation:');
  lines.push(`  ${result.recommendation.reason}`);
  lines.push(`  Action: ${result.recommendation.suggestedAction}`);
  lines.push('');

  lines.push('Current State:');
  lines.push(`  Active Bin: ${result.currentState.activeBinId}`);
  lines.push(`  Current Price: $${result.currentState.currentPrice.toFixed(2)}`);
  lines.push(
    `  Position Range: ${result.currentState.positionRange.min} - ${result.currentState.positionRange.max} (${result.currentState.positionRange.span} bins)`
  );
  lines.push(`  Distance from Range: ${result.currentState.distanceFromRange} bins`);
  lines.push(`  In Buffer Zone: ${result.currentState.isInBufferZone ? 'Yes' : 'No'}`);
  lines.push('');

  lines.push('Position Analysis:');
  lines.push(`  Health Status: ${result.analysis.positionHealth.toUpperCase()}`);
  lines.push(`  Earning Fees: ${result.analysis.isEarningFees ? 'Yes' : 'No'}`);
  lines.push(`  Buffer Bins Remaining: ${result.analysis.bufferBinsRemaining}`);

  if (result.analysis.estimatedTimeToOutOfRange) {
    lines.push(`  Est. Time to Out-of-Range: ${result.analysis.estimatedTimeToOutOfRange}`);
  }

  if (!result.analysis.isEarningFees) {
    lines.push('');
    lines.push('WARNING: Position is NOT earning fees in current market conditions!');
  }

  if (result.suggestedNewRange) {
    lines.push('');
    lines.push('Suggested New Range:');
    lines.push(
      `  Min Bin: ${result.suggestedNewRange.minBin} to Max Bin: ${result.suggestedNewRange.maxBin}`
    );
    lines.push(`  Strategy: ${result.suggestedNewRange.strategy}`);
    lines.push(`  Reasoning: ${result.suggestedNewRange.reasoning}`);
  }

  lines.push('');

  // Action items based on priority
  if (result.recommendation.priority === 'critical') {
    lines.push('IMMEDIATE ACTION REQUIRED:');
    lines.push('1. Close current position to stop further opportunity cost');
    lines.push('2. Create new position around active bin');
    lines.push('3. Consider using suggested range above');
  } else if (result.recommendation.priority === 'high') {
    lines.push('ACTION RECOMMENDED:');
    lines.push('1. Monitor position closely over next few hours');
    lines.push('2. Prepare to rebalance if price continues moving away');
    lines.push('3. Review suggested new range');
  } else if (result.recommendation.priority === 'medium') {
    lines.push('MONITORING ADVISED:');
    lines.push('1. Check position health daily');
    lines.push('2. No immediate action needed');
    lines.push('3. Set alerts if active bin moves closer to buffer edge');
  } else {
    lines.push('NO ACTION NEEDED:');
    lines.push('1. Position is healthy and earning fees');
    lines.push('2. Continue regular monitoring');
    lines.push('3. Review rebalancing strategy if market conditions change');
  }

  lines.push('');
  lines.push(`Last Updated: ${new Date(result.timestamp).toLocaleString()}`);

  return lines.join('\n');
}

/**
 * Formats error for tool response
 * @param error - The error
 * @returns Formatted error message
 */
export function formatCalculateRebalanceError(error: unknown): string {
  return `Failed to calculate rebalance strategy.\n\n${formatError(error)}\n\nPlease check the position ID and try again.`;
}
