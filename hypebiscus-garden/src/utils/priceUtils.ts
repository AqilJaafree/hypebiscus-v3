// Simple price fetching utility using Jupiter API
import axios from 'axios';

// Token mint addresses
export const TOKEN_MINTS = {
  SOL: 'So11111111111111111111111111111111111111112',
  zBTC: 'zBTCug3er3tLyffELcvDNrKkCymbPWysGcWihESYfLg',
};

// Configuration constants
const PRICE_FETCH_CONFIG = {
  DEFAULT_RETRIES: 3,
  MAX_BACKOFF_MS: 5000,
  REQUEST_TIMEOUT_MS: 10000,
  ESTIMATED_SOL_PRICE: 200,
} as const;

interface PriceResponse {
  [key: string]: {
    usdPrice: number;
    blockId: number;
    decimals: number;
    priceChange24h: number;
  };
}

interface TokenPrices {
  zbtcPrice: number;
  solPrice: number;
}

/**
 * Sleep utility for retry logic
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if error is a network-related error
 */
function isNetworkError(error: any): boolean {
  return error.code === 'ENOTFOUND' ||
         error.code === 'EAI_AGAIN' ||
         error.code === 'ETIMEDOUT';
}

/**
 * Calculate exponential backoff wait time
 */
function calculateBackoffTime(attemptNumber: number): number {
  const baseDelay = 1000 * Math.pow(2, attemptNumber - 1);
  return Math.min(baseDelay, PRICE_FETCH_CONFIG.MAX_BACKOFF_MS);
}

/**
 * Build request headers with optional API key
 */
function buildRequestHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};

  if (process.env.JUPITER_API_KEY) {
    headers['x-api-key'] = process.env.JUPITER_API_KEY;
    console.log('🔑 Using Jupiter API key from environment');
  } else {
    console.warn('⚠️  No Jupiter API key found in environment (JUPITER_API_KEY)');
  }

  return headers;
}

/**
 * Fetch prices from Jupiter API (single attempt)
 */
async function fetchPricesFromJupiter(): Promise<TokenPrices | null> {
  const response = await axios.get<PriceResponse>(
    'https://api.jup.ag/price/v3',
    {
      params: {
        ids: `${TOKEN_MINTS.zBTC},${TOKEN_MINTS.SOL}`,
      },
      headers: buildRequestHeaders(),
      timeout: PRICE_FETCH_CONFIG.REQUEST_TIMEOUT_MS,
    }
  );

  const zbtcPrice = response.data[TOKEN_MINTS.zBTC]?.usdPrice || 0;
  const solPrice = response.data[TOKEN_MINTS.SOL]?.usdPrice || 0;

  if (zbtcPrice === 0 || solPrice === 0) {
    console.warn('⚠️  Warning: Price fetch returned 0 for one or more tokens');
    return null;
  }

  console.log(`✅ Got prices from Jupiter: zBTC=$${zbtcPrice.toFixed(2)}, SOL=$${solPrice.toFixed(2)}`);
  return { zbtcPrice, solPrice };
}

/**
 * Handle retry attempt with error logging and backoff
 */
async function handleRetryAttempt(
  attemptNumber: number,
  totalRetries: number,
  error: any
): Promise<void> {
  const errorMessage = isNetworkError(error)
    ? `Network error on attempt ${attemptNumber}: ${error.message}`
    : `Error on attempt ${attemptNumber}: ${error.message}`;

  console.warn(`⚠️  ${errorMessage}`);

  if (attemptNumber < totalRetries) {
    const waitTime = calculateBackoffTime(attemptNumber);
    console.log(`⏳ Waiting ${waitTime}ms before retry...`);
    await sleep(waitTime);
  }
}

/**
 * Attempt to fetch prices with retry logic
 */
async function fetchPricesWithRetry(retries: number): Promise<TokenPrices | null> {
  let lastError: any;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`💰 Fetching token prices from Jupiter API (attempt ${attempt}/${retries})...`);

      const prices = await fetchPricesFromJupiter();
      if (prices) {
        return prices;
      }
    } catch (error: any) {
      lastError = error;
      await handleRetryAttempt(attempt, retries, error);
    }
  }

  console.error('❌ All price fetch attempts failed');
  return null;
}

/**
 * Estimate prices from pool price ratio
 */
function estimatePricesFromPool(poolPrice: number): TokenPrices {
  console.log('📊 Using fallback: estimating prices from pool price');

  // Pool price is zBTC/SOL ratio
  // Estimate: if pool price is ~6515, means 1 zBTC ≈ 6515 SOL
  const estimatedSolPrice = PRICE_FETCH_CONFIG.ESTIMATED_SOL_PRICE;
  const estimatedZbtcPrice = poolPrice * estimatedSolPrice;

  console.log(`⚠️  Using ESTIMATED prices: zBTC=$${estimatedZbtcPrice.toFixed(2)}, SOL=$${estimatedSolPrice.toFixed(2)}`);
  console.log('⚠️  Note: These are estimates. Accurate prices will be used when closing position via MCP.');

  return {
    zbtcPrice: estimatedZbtcPrice,
    solPrice: estimatedSolPrice,
  };
}

/**
 * Handle price fetch failure with fallback or error
 */
function handlePriceFetchFailure(
  poolPrice: number | undefined,
  retries: number,
  lastError: any
): TokenPrices {
  if (poolPrice && poolPrice > 0) {
    return estimatePricesFromPool(poolPrice);
  }

  console.error('❌ No fallback prices available');
  throw new Error(
    `Failed to fetch token prices after ${retries} attempts: ${lastError?.message || 'Unknown error'}`
  );
}

/**
 * Fetch token prices from Jupiter API with retry logic
 * Falls back to pool price estimates if all attempts fail
 */
export async function fetchTokenPrices(
  retries = PRICE_FETCH_CONFIG.DEFAULT_RETRIES,
  poolPrice?: number
): Promise<TokenPrices> {
  // Use official Jupiter Price API v3 (current stable)
  // Docs: https://dev.jup.ag/docs/price/v3
  // Response format: { "mintAddress": { "usdPrice": 123.45, "blockId": 123, ... } }
  // API key required from env (get free key at: https://portal.jup.ag/)

  const prices = await fetchPricesWithRetry(retries);

  if (prices) {
    return prices;
  }

  return handlePriceFetchFailure(poolPrice, retries, new Error('All retries failed'));
}

/**
 * Fetch actual position amounts from blockchain
 */
export async function fetchPositionAmounts(
  pool: any,
  positionId: string
): Promise<{ zbtcAmount: number; solAmount: number }> {
  try {
    const { PublicKey } = await import('@solana/web3.js');
    const positionPubkey = new PublicKey(positionId);
    const position = await pool.getPosition(positionPubkey);

    if (!position || !position.positionData) {
      throw new Error('Position not found on blockchain');
    }

    // Use SDK's pre-calculated totals (Option B)
    const zbtcAmount = Number(position.positionData.totalXAmount) / 1e8;
    const solAmount = Number(position.positionData.totalYAmount) / 1e9;

    console.log(`📊 Position amounts: ${zbtcAmount.toFixed(8)} zBTC, ${solAmount.toFixed(4)} SOL`);

    return { zbtcAmount, solAmount };
  } catch (error: any) {
    console.error('Error fetching position amounts:', error.message);
    throw error;
  }
}
