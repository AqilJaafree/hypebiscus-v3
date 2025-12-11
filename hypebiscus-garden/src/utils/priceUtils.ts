// Simple price fetching utility using Jupiter API
import axios from 'axios';

// Token mint addresses
export const TOKEN_MINTS = {
  SOL: 'So11111111111111111111111111111111111111112',
  zBTC: 'zBTCug3er3tLyffELcvDNrKkCymbPWysGcWihESYfLg',
};

interface PriceResponse {
  [key: string]: {
    usdPrice: number;
    blockId: number;
    decimals: number;
    priceChange24h: number;
  };
}

/**
 * Sleep utility for retry logic
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch token prices from Jupiter API with retry logic
 * Falls back to pool price estimates if all attempts fail
 */
export async function fetchTokenPrices(
  retries = 3,
  poolPrice?: number
): Promise<{
  zbtcPrice: number;
  solPrice: number;
}> {
  let lastError: any;

  // Try direct Jupiter API with retries
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`💰 Fetching token prices from Jupiter API (attempt ${attempt}/${retries})...`);

      // Use official Jupiter Price API v3 (current stable)
      // Docs: https://dev.jup.ag/docs/price/v3
      // Response format: { "mintAddress": { "usdPrice": 123.45, "blockId": 123, ... } }
      // API key required from env (get free key at: https://portal.jup.ag/)
      const headers: any = {};
      if (process.env.JUPITER_API_KEY) {
        headers['x-api-key'] = process.env.JUPITER_API_KEY;
        console.log('🔑 Using Jupiter API key from environment');
      } else {
        console.warn('⚠️  No Jupiter API key found in environment (JUPITER_API_KEY)');
      }

      const response = await axios.get<PriceResponse>(
        'https://api.jup.ag/price/v3',
        {
          params: {
            ids: `${TOKEN_MINTS.zBTC},${TOKEN_MINTS.SOL}`,
          },
          headers,
          timeout: 10000,
        }
      );

      const zbtcPrice = response.data[TOKEN_MINTS.zBTC]?.usdPrice || 0;
      const solPrice = response.data[TOKEN_MINTS.SOL]?.usdPrice || 0;

      if (zbtcPrice === 0 || solPrice === 0) {
        console.warn('⚠️  Warning: Price fetch returned 0 for one or more tokens');
      }

      if (zbtcPrice > 0 && solPrice > 0) {
        console.log(`✅ Got prices from Jupiter: zBTC=$${zbtcPrice.toFixed(2)}, SOL=$${solPrice.toFixed(2)}`);
        return { zbtcPrice, solPrice };
      }
    } catch (error: any) {
      lastError = error;
      const isNetworkError = error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN' || error.code === 'ETIMEDOUT';

      if (isNetworkError) {
        console.warn(`⚠️  Network error on attempt ${attempt}: ${error.message}`);
      } else {
        console.warn(`⚠️  Error on attempt ${attempt}: ${error.message}`);
      }

      // Wait before retrying (exponential backoff)
      if (attempt < retries) {
        const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`⏳ Waiting ${waitTime}ms before retry...`);
        await sleep(waitTime);
      }
    }
  }

  // All retries failed - use fallback if pool price provided
  console.error('❌ All price fetch attempts failed');

  if (poolPrice && poolPrice > 0) {
    console.log('📊 Using fallback: estimating prices from pool price');

    // Pool price is zBTC/SOL ratio
    // Estimate: if pool price is ~6515, means 1 zBTC ≈ 6515 SOL
    // Rough estimates (will be replaced by accurate prices when closing)
    const estimatedSolPrice = 200; // Rough SOL price estimate
    const estimatedZbtcPrice = poolPrice * estimatedSolPrice;

    console.log(`⚠️  Using ESTIMATED prices: zBTC=$${estimatedZbtcPrice.toFixed(2)}, SOL=$${estimatedSolPrice.toFixed(2)}`);
    console.log('⚠️  Note: These are estimates. Accurate prices will be used when closing position via MCP.');

    return {
      zbtcPrice: estimatedZbtcPrice,
      solPrice: estimatedSolPrice,
    };
  }

  // No fallback available
  console.error('❌ No fallback prices available');
  throw new Error(`Failed to fetch token prices after ${retries} attempts: ${lastError?.message || 'Unknown error'}`);
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
