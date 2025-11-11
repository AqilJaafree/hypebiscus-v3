/**
 * Custom hook for fetching hybrid positions (database + blockchain)
 * Uses SWR for data fetching with caching and automatic revalidation
 */

import useSWR from 'swr';
import { mcpClient } from '@/lib/services/mcpClient';
import type { HybridPosition, HybridSyncResponse } from '@/types/hybrid-sync';

interface UseHybridPositionsOptions {
  includeHistorical?: boolean;
  includeLive?: boolean;
  refreshInterval?: number;
}

interface UseHybridPositionsResult {
  positions: HybridPosition[];
  activePositions: HybridPosition[];
  closedPositions: HybridPosition[];
  summary: {
    total: number;
    active: number;
    closed: number;
    merged: number;
  };
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
}

/**
 * Fetcher function for SWR
 */
async function fetchHybridPositions(
  walletAddress: string,
  includeHistorical: boolean,
  includeLive: boolean
): Promise<HybridPosition[]> {
  const response = await mcpClient.getUserPositionsWithSync(
    walletAddress,
    includeHistorical,
    includeLive
  );

  // The MCP client returns the raw response, which could be an array or an object
  if (Array.isArray(response)) {
    return response as HybridPosition[];
  }

  // If it's an object with a positions array, extract it
  if (response && typeof response === 'object' && 'positions' in response) {
    return (response as HybridSyncResponse).positions;
  }

  // Fallback to empty array
  return [];
}

/**
 * Hook to fetch hybrid positions for a wallet
 */
export function useHybridPositions(
  walletAddress: string | null | undefined,
  options: UseHybridPositionsOptions = {}
): UseHybridPositionsResult {
  const {
    includeHistorical = true,
    includeLive = true,
    refreshInterval = 30000, // 30 seconds default
  } = options;

  // Create SWR key - null disables the request
  const swrKey = walletAddress
    ? ['hybrid-positions', walletAddress, includeHistorical, includeLive]
    : null;

  const { data, error, isLoading, mutate } = useSWR(
    swrKey,
    () => fetchHybridPositions(walletAddress!, includeHistorical, includeLive),
    {
      refreshInterval,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 10000, // 10 seconds deduping
    }
  );

  const positions = data || [];

  // Split positions by status
  const activePositions = positions.filter((p) => p.status === 'active');
  const closedPositions = positions.filter((p) => p.status === 'closed');

  // Calculate merged count (positions found in both sources)
  const mergedCount = positions.filter((p) => p.source === 'both').length;

  // Summary
  const summary = {
    total: positions.length,
    active: activePositions.length,
    closed: closedPositions.length,
    merged: mergedCount,
  };

  return {
    positions,
    activePositions,
    closedPositions,
    summary,
    isLoading,
    error: error || null,
    refresh: () => mutate(),
  };
}
