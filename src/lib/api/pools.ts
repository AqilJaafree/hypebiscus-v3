// src/lib/api/pools.ts

export interface Pool {
    name: string;
    address: string;
    liquidity: string;
    current_price: number;
    apy: number;
    fees_24h: number;
    trade_volume_24h: number;
    bin_step?: number;
  }
  
  export interface Group {
    name: string;
    pairs: Pool[];
  }
  
  export interface PoolsResponse {
    groups: Group[];
    total: number;
  }
  
  /**
   * Fetch BTC pool data from the Meteora API
   * @param searchTerm The search term (e.g., 'wbtc-sol', 'zbtc-sol')
   * @returns Promise with the pools data
   */
  export const fetchPools = async (searchTerm: string): Promise<PoolsResponse> => {
    const response = await fetch(
      `https://dlmm-api.meteora.ag/pair/all_by_groups?search_term=${searchTerm}`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch ${searchTerm} pools`);
    }
    
    return await response.json();
  }