// Meteora DLMM API service
import axios, { AxiosInstance } from 'axios';
import { API_ENDPOINTS, config, logger } from '../config.js';
import { ErrorType, HypebiscusMCPError, MeteoraPoolResponse } from '../tools/types.js';
import { cache } from '../utils/cache.js';
import { withRetry } from '../utils/errors.js';

export class MeteoraApiService {
  private client: AxiosInstance;
  private cacheTtl: number;

  constructor() {
    this.client = axios.create({
      baseURL: API_ENDPOINTS.meteoraBase,
      timeout: config.requestTimeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Hypebiscus-MCP/1.0',
      },
    });

    this.cacheTtl = config.cacheTtl * 1000; // Convert to milliseconds
    logger.info('Initialized Meteora API service');
  }

  /**
   * Fetches pool data from Meteora API
   * @param poolAddress - The pool address
   * @returns Pool data
   */
  async getPoolData(poolAddress: string): Promise<MeteoraPoolResponse> {
    const cacheKey = `meteora:pool:${poolAddress}`;

    // Check cache first
    const cached = cache.get<MeteoraPoolResponse>(cacheKey);
    if (cached) {
      logger.info(`Using cached Meteora data for pool ${poolAddress}`);
      return cached;
    }

    try {
      const response = await withRetry(
        async () => {
          logger.debug(`Fetching Meteora pool data: ${poolAddress}`);
          return await this.client.get<MeteoraPoolResponse>(`/pair/${poolAddress}`);
        },
        2,
        1000
      );

      if (!response.data) {
        throw new HypebiscusMCPError(
          ErrorType.API_ERROR,
          `No data returned for pool ${poolAddress}`
        );
      }

      // Cache the result
      cache.set(cacheKey, response.data, this.cacheTtl);
      logger.info(`Successfully fetched Meteora data for pool ${poolAddress}`);

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          throw new HypebiscusMCPError(
            ErrorType.INVALID_POOL_ADDRESS,
            `Pool ${poolAddress} not found in Meteora`
          );
        }

        if (error.response?.status === 429) {
          throw new HypebiscusMCPError(
            ErrorType.API_ERROR,
            'Meteora API rate limit exceeded. Please try again later.'
          );
        }

        throw new HypebiscusMCPError(
          ErrorType.API_ERROR,
          `Meteora API error: ${error.response?.status || 'Unknown'}`,
          error.message
        );
      }

      logger.error('Failed to fetch Meteora pool data:', error);
      throw new HypebiscusMCPError(
        ErrorType.API_ERROR,
        'Failed to fetch pool data from Meteora',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Fetches all pools from Meteora API
   * @returns Array of all pools
   */
  async getAllPools(): Promise<MeteoraPoolResponse[]> {
    const cacheKey = 'meteora:all-pools';

    // Check cache first (longer TTL for all pools)
    const cached = cache.get<MeteoraPoolResponse[]>(cacheKey);
    if (cached) {
      logger.info('Using cached Meteora all pools data');
      return cached;
    }

    try {
      const response = await withRetry(
        async () => {
          logger.debug('Fetching all Meteora pools');
          return await this.client.get<{ pairs: MeteoraPoolResponse[] }>('/pair/all');
        },
        2,
        1000
      );

      if (!response.data?.pairs) {
        throw new HypebiscusMCPError(
          ErrorType.API_ERROR,
          'Invalid response format from Meteora all pools API'
        );
      }

      // Cache for 5 minutes (longer than individual pool queries)
      cache.set(cacheKey, response.data.pairs, 5 * 60 * 1000);
      logger.info(`Successfully fetched ${response.data.pairs.length} pools from Meteora`);

      return response.data.pairs;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new HypebiscusMCPError(
          ErrorType.API_ERROR,
          `Meteora API error: ${error.response?.status || 'Unknown'}`,
          error.message
        );
      }

      logger.error('Failed to fetch all Meteora pools:', error);
      throw new HypebiscusMCPError(
        ErrorType.API_ERROR,
        'Failed to fetch all pools from Meteora',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Searches for pools by token symbols
   * @param tokenA - First token symbol
   * @param tokenB - Second token symbol
   * @returns Matching pools
   */
  async searchPools(tokenA: string, tokenB: string): Promise<MeteoraPoolResponse[]> {
    try {
      const allPools = await this.getAllPools();

      const searchTermA = tokenA.toLowerCase();
      const searchTermB = tokenB.toLowerCase();

      const matchingPools = allPools.filter((pool) => {
        const poolName = pool.name.toLowerCase();
        return (
          (poolName.includes(searchTermA) && poolName.includes(searchTermB)) ||
          (poolName.includes(searchTermB) && poolName.includes(searchTermA))
        );
      });

      logger.info(`Found ${matchingPools.length} pools matching ${tokenA}-${tokenB}`);
      return matchingPools;
    } catch (error) {
      logger.error(`Failed to search pools for ${tokenA}-${tokenB}:`, error);
      throw error;
    }
  }
}

// Export singleton instance
export const meteoraApi = new MeteoraApiService();
