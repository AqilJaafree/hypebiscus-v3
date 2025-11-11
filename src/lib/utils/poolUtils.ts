// src/lib/utils/poolUtils.ts

export interface ApiPool {
  name: string;
  address: string;
  liquidity: string;
  current_price: string | number;
  apy: number;
  fees_24h: number;
  trade_volume_24h: number;
  bin_step?: number;
}

export interface FormattedPool {
  name: string;
  address: string;
  liquidity: string;
  currentPrice: string;
  apy: string;
  fees24h: string;
  apr: string;  // ✅ ADDED
  volume24h: string;
  binStep: string;
  estimatedDailyEarnings: string;
  investmentAmount: string;
  riskLevel: string;
}

export interface PoolFilterOptions {
  minTVL?: number;
  maxBinStep?: number;
  preferredBinSteps?: number[];
  portfolioStyle?: string;
}

/**
 * Enhanced currency formatter with better precision handling
 */
export function formatCurrencyValue(
  value: string | number | undefined, 
  decimals: number = 0,
  options: { 
    prefix?: string;
    suffix?: string;
    fallback?: string;
  } = {}
): string {
  const { prefix = '', suffix = '', fallback = '0' } = options;
  
  let numValue: number;
  
  if (typeof value === 'string') {
    numValue = parseFloat(value);
  } else if (typeof value === 'number') {
    numValue = value;
  } else {
    return fallback;
  }
  
  if (isNaN(numValue)) return fallback;
  
  const formatted = numValue.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  
  return `${prefix}${formatted}${suffix}`;
}

/**
 * Calculate fee APY from 24h fees and TVL
 */
export function calculateFeeAPY(fees24h: number, tvl: number): number {
  if (tvl <= 0) return 0;
  return (fees24h / tvl) * 100;
}

/**
 * Calculate APR (Annual Percentage Rate) from 24h fees and TVL
 */
export function calculateFeeAPR(fees24h: number, tvl: number): number {
  if (tvl <= 0) return 0;
  return (fees24h / tvl) * 365 * 100;
}

/**
 * Format a single pool with all necessary calculations
 */
export function formatPool(
  apiPool: ApiPool, 
  riskLevel: string = 'conservative',
  investmentAmount: number = 10000
): FormattedPool {
  const fees24h = typeof apiPool.fees_24h === 'number' ? apiPool.fees_24h : 0;
  const liquidityValue = parseFloat(apiPool.liquidity);
  const feeAPY = calculateFeeAPY(fees24h, liquidityValue);
  const feeAPR = calculateFeeAPR(fees24h, liquidityValue);  // ✅ ADDED
  const binStep = apiPool.bin_step?.toString() || 'N/A';
  
  // Calculate estimated daily earnings
  const dailyEarningsRate = fees24h / liquidityValue;
  const estimatedDailyEarnings = dailyEarningsRate * investmentAmount;

  return {
    name: apiPool.name,
    address: apiPool.address,
    liquidity: formatCurrencyValue(liquidityValue, 0),
    currentPrice: formatCurrencyValue(apiPool.current_price, 2),
    apy: feeAPY.toFixed(2) + '%',
    fees24h: formatCurrencyValue(fees24h, 2),
    apr: feeAPR.toFixed(2) + '%',  // ✅ ADDED
    volume24h: formatCurrencyValue(apiPool.trade_volume_24h, 0),
    binStep,
    estimatedDailyEarnings: estimatedDailyEarnings.toFixed(2),
    investmentAmount: formatCurrencyValue(investmentAmount, 0),
    riskLevel
  };
}

/**
 * Filter pools based on portfolio style and other criteria
 */
export function filterPools(
  pools: ApiPool[], 
  options: PoolFilterOptions = {}
): ApiPool[] {
  const {
    minTVL = 3000,
    preferredBinSteps = []
  } = options;

  return pools
    .filter(pool => {
      // Filter by minimum TVL
      const tvl = parseFloat(pool.liquidity);
      if (tvl < minTVL) return false;

      // Filter by APY and fees (remove extremely low performers)
      if (pool.apy < 0.03 || pool.fees_24h < 5) return false;

      return true;
    })
    .filter(pool => {
      // If preferred bin steps are specified, prioritize them
      if (preferredBinSteps.length > 0 && pool.bin_step) {
        return preferredBinSteps.includes(pool.bin_step);
      }
      return true;
    });
}

/**
 * Sort pools based on portfolio style
 */
export function sortPoolsByStyle(
  pools: ApiPool[], 
  portfolioStyle: string
): ApiPool[] {
  const sortedPools = [...pools];

  switch (portfolioStyle) {
    case 'conservative':
      return sortedPools.sort((a, b) => {
        const binStepA = a.bin_step || 0;
        const binStepB = b.bin_step || 0;

        // Prioritize bin step 50
        if (binStepA === 50 && binStepB !== 50) return -1;
        if (binStepA !== 50 && binStepB === 50) return 1;

        // Then prioritize higher TVL
        return parseFloat(b.liquidity) - parseFloat(a.liquidity);
      });

    case 'moderate':
      return sortedPools.sort((a, b) => {
        const binStepA = a.bin_step || 0;
        const binStepB = b.bin_step || 0;

        const isPreferredA = binStepA === 10 || binStepA === 15;
        const isPreferredB = binStepB === 10 || binStepB === 15;

        if (isPreferredA && !isPreferredB) return -1;
        if (!isPreferredA && isPreferredB) return 1;

        // If both preferred, prioritize bin step 10
        if (isPreferredA && isPreferredB) {
          if (binStepA === 10 && binStepB === 15) return -1;
          if (binStepA === 15 && binStepB === 10) return 1;
        }

        // Balance TVL and APY
        const scoreA = parseFloat(a.liquidity) * 0.6 + a.apy * 0.4;
        const scoreB = parseFloat(b.liquidity) * 0.6 + b.apy * 0.4;
        return scoreB - scoreA;
      });

    case 'aggressive':
      return sortedPools.sort((a, b) => {
        const binStepA = a.bin_step || 0;
        const binStepB = b.bin_step || 0;

        // Prioritize bin step 5
        if (binStepA === 5 && binStepB !== 5) return -1;
        if (binStepA !== 5 && binStepB === 5) return 1;

        // Then prioritize higher APY
        return b.apy - a.apy;
      });

    default:
      return sortedPools;
  }
}

/**
 * Get preferred bin steps for a portfolio style
 */
export function getPreferredBinSteps(portfolioStyle: string): number[] {
  switch (portfolioStyle) {
    case 'conservative':
      return [50];
    case 'moderate':
      return [10, 15];
    case 'aggressive':
      return [5];
    default:
      return [];
  }
}

/**
 * Select the best pool from a list based on criteria and history
 */
export function selectOptimalPool(
  pools: ApiPool[],
  portfolioStyle: string,
  shownAddresses: string[] = []
): ApiPool | null {
  if (pools.length === 0) return null;

  const preferredBinSteps = getPreferredBinSteps(portfolioStyle);
  const sortedPools = sortPoolsByStyle(pools, portfolioStyle);

  // First try: unshown pool with preferred bin step
  for (const pool of sortedPools) {
    const hasPreferredBinStep = preferredBinSteps.includes(pool.bin_step || 0);
    const isNewPool = !shownAddresses.includes(pool.address);
    
    if (isNewPool && hasPreferredBinStep) {
      return pool;
    }
  }

  // Second try: any unshown pool
  for (const pool of sortedPools) {
    if (!shownAddresses.includes(pool.address)) {
      return pool;
    }
  }

  // Last resort: best pool with preferred bin step (even if shown)
  const preferredPool = sortedPools.find(pool =>
    preferredBinSteps.includes(pool.bin_step || 0)
  );

  return preferredPool || sortedPools[0];
}