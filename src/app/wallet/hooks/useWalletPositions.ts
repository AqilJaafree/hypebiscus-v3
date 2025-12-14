import { useState, useEffect } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import DLMM from '@meteora-ag/dlmm';

export interface PoolWithActiveId {
  activeId?: number;
  tokenXMint?: unknown;
  tokenYMint?: unknown;
  currentMarketPrice?: number;
  [key: string]: unknown;
}

export interface PositionInfoType {
  lbPair: PoolWithActiveId;
  lbPairPositionsData: unknown[];
  [key: string]: unknown;
}

export function useWalletPositions(publicKey: PublicKey | null, connected: boolean) {
  const [positions, setPositions] = useState(new Map<string, PositionInfoType>());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchPositions = async (userPubKey: PublicKey) => {
    try {
      setLoading(true);
      setError('');

      const connection = new Connection(
        process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
          'https://api.mainnet-beta.solana.com'
      );

      const userPositions = await DLMM.getAllLbPairPositionsByUser(
        connection,
        userPubKey
      );

      // Fetch actual current market price for each pool
      for (const [lbPairAddress, positionInfo] of userPositions.entries()) {
        try {
          const dlmmPool = await DLMM.create(
            connection,
            new PublicKey(lbPairAddress)
          );

          const activeBin = await dlmmPool.getActiveBin();

          if (activeBin && activeBin.pricePerToken) {
            const pool = positionInfo.lbPair as PoolWithActiveId;
            pool.currentMarketPrice = Number(activeBin.pricePerToken);
          }
        } catch (error) {
          console.error(
            `Error fetching current price for pool ${lbPairAddress}:`,
            error
          );
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setPositions(userPositions as any as Map<string, PositionInfoType>);
    } catch (err) {
      setError('Failed to fetch positions: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const refreshPositions = () => {
    if (publicKey) {
      fetchPositions(publicKey);
    }
  };

  useEffect(() => {
    if (connected && publicKey) {
      fetchPositions(publicKey);
    } else {
      setPositions(new Map());
    }
  }, [connected, publicKey]);

  return {
    positions,
    loading,
    error,
    refreshPositions,
  };
}
