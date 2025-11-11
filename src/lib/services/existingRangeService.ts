// src/lib/services/existingRangeService.ts
import { Connection } from '@solana/web3.js';
import { MeteoraDlmmService } from '@/lib/meteora/meteoraDlmmService';

interface ExistingRange {
  minBinId: number;
  maxBinId: number;
  centerBinId: number;
  width: number;
  positionCount: number;
  totalLiquidity: number;
  estimatedCost: number; // Only position rent since bins exist
  isPopular: boolean;
}

interface RangeRecommendation {
  cheapest: ExistingRange;
  mostPopular: ExistingRange;
  balanced: ExistingRange;
  all: ExistingRange[];
}

// Define types to avoid any usage
interface DLMMPool {
  getActiveBin(): Promise<{
    binId: number;
    price: string;
    xAmount: string;
    yAmount: string;
  }>;
  getBin(binId: number): Promise<unknown>;
  [key: string]: unknown;
}

export class ExistingRangeService {
  private dlmmService: MeteoraDlmmService;

  constructor(connection: Connection) {
    this.dlmmService = new MeteoraDlmmService(connection);
  }

  /**
   * Find existing ranges from current positions in the pool
   */
  async findExistingRanges(poolAddress: string): Promise<RangeRecommendation> {
    try {
      const pool = await this.dlmmService.initializePool(poolAddress);
      const typedPool = pool as unknown as DLMMPool;
      const activeBin = await typedPool.getActiveBin();
      
      // Get all existing positions in the pool
      const existingPositions = await this.getPoolPositions(poolAddress);
      
      // Analyze ranges from existing positions
      const rangeAnalysis = this.analyzeExistingRanges(existingPositions);
      
      // Generate recommendations
      return this.generateRecommendations(rangeAnalysis, activeBin.binId);
      
    } catch {
      // Remove unused error parameter
      console.error('Error finding existing ranges');
      // Fallback to conservative defaults
      return this.getDefaultRanges(poolAddress);
    }
  }

  /**
   * Get all positions in a pool (sample approach)
   */
  private async getPoolPositions(poolAddress: string): Promise<Array<{
    minBinId: number;
    maxBinId: number;
    liquidity: number;
  }>> {
    try {
      const pool = await this.dlmmService.initializePool(poolAddress);
      const typedPool = pool as unknown as DLMMPool;
      
      // Method 1: Try to get positions from program accounts
      // This is a simplified approach - in production you'd use more sophisticated querying
      
      // For now, we'll use a heuristic approach by checking common ranges
      // around the active bin that are likely to exist
      const activeBin = await typedPool.getActiveBin();
      const commonRanges = [];
      
      // Check popular range patterns
      const popularWidths = [3, 5, 7, 10, 15, 20];
      
      for (const width of popularWidths) {
        for (let offset = -5; offset <= 5; offset++) {
          const centerBin = activeBin.binId + offset;
          const minBin = centerBin - width;
          const maxBin = centerBin + width;
          
          // Check if this range has existing liquidity/bins
          const hasLiquidity = await this.checkRangeHasLiquidity(typedPool, minBin, maxBin);
          
          if (hasLiquidity) {
            commonRanges.push({
              minBinId: minBin,
              maxBinId: maxBin,
              liquidity: Math.random() * 1000000 // Placeholder - would get real data
            });
          }
        }
      }
      
      return commonRanges;
    } catch {
      // Remove unused error parameter
      console.error('Error getting pool positions');
      return [];
    }
  }

  /**
   * Check if a range has existing liquidity (indicates existing binArrays)
   */
  private async checkRangeHasLiquidity(pool: DLMMPool, minBinId: number, maxBinId: number): Promise<boolean> {
    try {
      // Try to get bin data for a few bins in the range
      const sampleBins = [minBinId, Math.floor((minBinId + maxBinId) / 2), maxBinId];
      
      for (const binId of sampleBins) {
        try {
          const binData = await pool.getBin(binId);
          // If we can get bin data, the binArray likely exists
          if (binData) {
            return true;
          }
        } catch {
          // Remove unused error parameter
          // Bin doesn't exist, continue checking
        }
      }
      
      return false;
    } catch {
      // Remove unused error parameter
      return false;
    }
  }

  /**
   * Analyze existing ranges to find patterns
   */
  private analyzeExistingRanges(
    positions: Array<{ minBinId: number; maxBinId: number; liquidity: number }>
    // Remove unused activeBinId parameter
  ): ExistingRange[] {
    const rangeMap = new Map<string, ExistingRange>();

    positions.forEach(position => {
      const width = position.maxBinId - position.minBinId;
      const centerBin = Math.floor((position.minBinId + position.maxBinId) / 2);
      const key = `${position.minBinId}-${position.maxBinId}`;

      if (rangeMap.has(key)) {
        const existing = rangeMap.get(key)!;
        existing.positionCount++;
        existing.totalLiquidity += position.liquidity;
      } else {
        rangeMap.set(key, {
          minBinId: position.minBinId,
          maxBinId: position.maxBinId,
          centerBinId: centerBin,
          width,
          positionCount: 1,
          totalLiquidity: position.liquidity,
          estimatedCost: 0.057, // Only position rent since bins exist
          isPopular: false // Will be determined later
        });
      }
    });

    const ranges = Array.from(rangeMap.values());
    
    // Mark popular ranges (multiple positions or high liquidity)
    ranges.forEach(range => {
      range.isPopular = range.positionCount > 1 || range.totalLiquidity > 500000;
    });

    return ranges.sort((a, b) => b.positionCount - a.positionCount);
  }

  /**
   * Generate recommendations based on analysis
   */
  private generateRecommendations(ranges: ExistingRange[], activeBinId: number): RangeRecommendation {
    if (ranges.length === 0) {
      // No existing ranges found, use defaults
      return this.getDefaultRecommendations(activeBinId);
    }

    // Find cheapest (all existing ranges should be 0.057 SOL)
    const cheapest = ranges.reduce((prev, curr) => 
      prev.estimatedCost < curr.estimatedCost ? prev : curr
    );

    // Find most popular (highest position count)
    const mostPopular = ranges.reduce((prev, curr) => 
      prev.positionCount > curr.positionCount ? prev : curr
    );

    // Find balanced (good position count, reasonable width)
    const balanced = ranges.find(range => 
      range.positionCount >= 2 && range.width >= 5 && range.width <= 15
    ) || mostPopular;

    return {
      cheapest,
      mostPopular,
      balanced,
      all: ranges
    };
  }

  /**
   * Default recommendations when no existing ranges found
   */
  private getDefaultRecommendations(activeBinId: number): RangeRecommendation {
    const defaultRange: ExistingRange = {
      minBinId: activeBinId - 10,
      maxBinId: activeBinId + 10,
      centerBinId: activeBinId,
      width: 20,
      positionCount: 0,
      totalLiquidity: 0,
      estimatedCost: 0.207, // Might need to create new bins
      isPopular: false
    };

    return {
      cheapest: defaultRange,
      mostPopular: defaultRange,
      balanced: defaultRange,
      all: [defaultRange]
    };
  }

  private async getDefaultRanges(poolAddress: string): Promise<RangeRecommendation> {
    const pool = await this.dlmmService.initializePool(poolAddress);
    const typedPool = pool as unknown as DLMMPool;
    const activeBin = await typedPool.getActiveBin();
    return this.getDefaultRecommendations(activeBin.binId);
  }
}