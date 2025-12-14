import { useState, useEffect } from 'react';
import type { PositionInfoType } from './useWalletPositions';

export type MaybeBase58 = { toBase58?: () => string };

// Helper function to check if a pool is a valid BTC pool
function isValidBTCPool(tokenXSymbol: string, tokenYSymbol: string): boolean {
  const pairName = `${tokenXSymbol?.toLowerCase()}-${tokenYSymbol?.toLowerCase()}`;

  return (
    pairName === 'wbtc-sol' ||
    pairName === 'sol-wbtc' ||
    pairName === 'zbtc-sol' ||
    pairName === 'sol-zbtc' ||
    pairName === 'cbbtc-sol' ||
    pairName === 'sol-cbbtc'
  );
}

// Token metadata cache
const tokenMetaCache: Record<string, TokenMeta> = {};

interface TokenMeta {
  icon: string;
  symbol: string;
  usdPrice?: number;
  [key: string]: unknown;
}

async function fetchTokenMeta(mint: string): Promise<TokenMeta | null> {
  if (tokenMetaCache[mint]) return tokenMetaCache[mint];
  const res = await fetch(
    `https://lite-api.jup.ag/tokens/v2/search?query=${mint}`
  );
  const data = await res.json();
  const token = data[0];
  tokenMetaCache[mint] = token;
  return token;
}

export function useFilteredPositions(positions: Map<string, PositionInfoType>) {
  const [filteredPositions, setFilteredPositions] = useState<Map<string, PositionInfoType>>(
    new Map()
  );

  useEffect(() => {
    const filterBTCPositions = async () => {
      const btcPositionsMap = new Map<string, PositionInfoType>();

      for (const [lbPairAddress, positionInfo] of positions.entries()) {
        const pool = positionInfo.lbPair;

        // Get token mint addresses
        const xMint =
          pool.tokenXMint &&
          typeof (pool.tokenXMint as MaybeBase58).toBase58 === 'function'
            ? (pool.tokenXMint as MaybeBase58).toBase58!()
            : pool.tokenXMint;
        const yMint =
          pool.tokenYMint &&
          typeof (pool.tokenYMint as MaybeBase58).toBase58 === 'function'
            ? (pool.tokenYMint as MaybeBase58).toBase58!()
            : pool.tokenYMint;

        try {
          const tokenXMeta = await fetchTokenMeta(xMint as string);
          const tokenYMeta = await fetchTokenMeta(yMint as string);

          if (
            tokenXMeta &&
            tokenYMeta &&
            isValidBTCPool(tokenXMeta.symbol, tokenYMeta.symbol)
          ) {
            btcPositionsMap.set(lbPairAddress, positionInfo);
          }
        } catch (error) {
          console.error(`Error filtering pool ${lbPairAddress}:`, error);
        }
      }

      setFilteredPositions(btcPositionsMap);
    };

    if (positions.size > 0) {
      filterBTCPositions();
    } else {
      setFilteredPositions(new Map());
    }
  }, [positions]);

  return filteredPositions;
}

// Export for reuse
export { fetchTokenMeta, isValidBTCPool };
export type { TokenMeta };
