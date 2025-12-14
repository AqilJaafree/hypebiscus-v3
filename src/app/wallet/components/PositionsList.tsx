import { PublicKey } from '@solana/web3.js';
import type { PositionPnLResult } from '@/lib/mcp-client';
import type { PositionInfoType } from '../hooks/useWalletPositions';

// Position type from DLMM (unknown structure from external library)
interface PositionType {
  publicKey: PublicKey;
  [key: string]: unknown;
}

interface PositionsListProps {
  positionsArray: [string, PositionInfoType][];
  viewMode: 'table' | 'card';
  pnlData: Map<string, PositionPnLResult>;
  onPnLUpdate: (positionId: string, pnl: PositionPnLResult) => void;
  refreshPositions: () => void;
  PositionItemComponent: React.ComponentType<unknown>;
}

export function PositionsList({
  positionsArray,
  viewMode,
  pnlData,
  onPnLUpdate,
  refreshPositions,
  PositionItemComponent,
}: PositionsListProps) {
  // Type assertion helper for component props
  const Component = PositionItemComponent as React.ComponentType<{
    lbPairAddress: string;
    positionInfo: PositionInfoType;
    positionIndex: number;
    refreshPositions: () => void;
    viewMode: 'table' | 'card';
    pnl?: PositionPnLResult;
    onPnLUpdate?: (positionId: string, pnl: PositionPnLResult) => void;
  }>;

  if (viewMode === 'table') {
    return (
      <div className="overflow-x-auto styled-scrollbar">
        <table className="min-w-full divide-y divide-border border border-border rounded-xl">
          <thead>
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Position/Pool
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Total Liquidity
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Fees Earned (Claimed)
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Current Balance
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Unclaimed Swap Fee
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Range
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="border-b border-border">
            {positionsArray.map(([lbPairAddress, positionInfo]) =>
              (positionInfo.lbPairPositionsData as PositionType[]).map((pos: PositionType, idx: number) => (
                <Component
                  key={`${lbPairAddress}-${idx}`}
                  lbPairAddress={lbPairAddress}
                  positionInfo={positionInfo}
                  positionIndex={idx}
                  refreshPositions={refreshPositions}
                  viewMode={viewMode}
                  pnl={pnlData.get(pos.publicKey.toBase58())}
                  onPnLUpdate={onPnLUpdate}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {positionsArray.map(([lbPairAddress, positionInfo]) =>
        (positionInfo.lbPairPositionsData as PositionType[]).map((pos: PositionType, idx: number) => (
          <Component
            key={`${lbPairAddress}-${idx}`}
            lbPairAddress={lbPairAddress}
            positionInfo={positionInfo}
            positionIndex={idx}
            refreshPositions={refreshPositions}
            viewMode={viewMode}
            pnl={pnlData.get(pos.publicKey.toBase58())}
            onPnLUpdate={onPnLUpdate}
          />
        ))
      )}
    </div>
  );
}
