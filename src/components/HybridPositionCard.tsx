/**
 * Hybrid Position Card Component
 * Displays a position from the hybrid sync (database + blockchain)
 */

import React from 'react';
import Image from 'next/image';
import type { HybridPosition } from '@/types/hybrid-sync';
import { PositionHealthBadge } from './PositionHealthBadge';
import { Button } from './ui/button';

interface HybridPositionCardProps {
  position: HybridPosition;
  viewMode: 'card' | 'table';
  onClaimFees?: () => void;
  onCloseAndWithdraw?: () => void;
  claiming?: boolean;
  closing?: boolean;
  canInteract?: boolean;
}

// Helper function to format balance with dynamic superscript for leading zeros after decimal
function formatBalanceWithSub(balance: number, decimals = 6) {
  if (balance === 0) return '0';
  const str = balance.toFixed(decimals);
  const match = str.match(/^([0-9]+)\.(0+)(\d*)$/);
  if (!match) return str;
  const [, intPart, zeros, rest] = match;
  return (
    <>
      {intPart}.0{sub(zeros.length)}
      {rest}
    </>
  );
  function sub(n: number | null) {
    return n && n > 1 ? (
      <sub style={{ fontSize: '0.7em', verticalAlign: 'baseline' }}>{n}</sub>
    ) : null;
  }
}

export function HybridPositionCard({
  position,
  viewMode,
  onClaimFees,
  onCloseAndWithdraw,
  claiming = false,
  closing = false,
  canInteract = false,
}: HybridPositionCardProps) {
  const isActive = position.status === 'active';
  const isClosed = position.status === 'closed';

  // Calculate holding period
  const entryDate = new Date(position.entryDate);
  const exitDate = position.exitDate ? new Date(position.exitDate) : new Date();
  const holdingDays = Math.floor(
    (exitDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (viewMode === 'card') {
    return (
      <div className="rounded-lg shadow-sm overflow-hidden p-4 mb-4 border border-border">
        {/* Header with token pair and status */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="flex items-start">
              <Image
                src={`https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${position.tokenX.symbol}/logo.png`}
                alt={position.tokenX.symbol}
                width={32}
                height={32}
                className="rounded-full border-2 border-border"
                unoptimized
                onError={(e) => {
                  e.currentTarget.src = '/token-placeholder.png';
                }}
              />
              <Image
                src={`https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${position.tokenY.symbol}/logo.png`}
                alt={position.tokenY.symbol}
                width={32}
                height={32}
                className="rounded-full border-2 border-border -ml-2"
                unoptimized
                onError={(e) => {
                  e.currentTarget.src = '/token-placeholder.png';
                }}
              />
            </div>
            <div>
              <div className="font-semibold text-lg">
                {position.tokenX.symbol} / {position.tokenY.symbol}
              </div>
              <div className="text-xs text-gray-500">
                {position.source === 'both' && '🔄 Synced'}{' '}
                {isClosed ? `Closed ${holdingDays}d ago` : `Active ${holdingDays}d`}
              </div>
            </div>
          </div>

          {/* Status badges */}
          <div className="flex flex-col items-end gap-2">
            {isActive && position.health && (
              <PositionHealthBadge health={position.health} size="sm" />
            )}
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                isActive
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-gray-500/20 text-gray-400'
              }`}
            >
              {position.status.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="flex flex-col md:flex-row gap-6 mb-6">
          <div>
            <div className="text-sm text-gray-400 mb-1">Total Liquidity</div>
            <div className="text-2xl font-semibold text-white">
              ${position.totalLiquidityUSD.toFixed(4)}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-400 mb-1">
              Fees {isActive ? 'Earned' : 'Claimed'}
            </div>
            <div className="text-2xl font-semibold text-white">
              ${position.fees.totalUSD.toFixed(4)}
            </div>
          </div>
          {position.pnl && (
            <div>
              <div className="text-sm text-gray-400 mb-1">PnL</div>
              <div
                className={`text-2xl font-semibold ${
                  position.pnl.usd >= 0 ? 'text-green-400' : 'text-red-400'
                }`}
              >
                {position.pnl.usd >= 0 ? '+' : ''}${position.pnl.usd.toFixed(2)} (
                {position.pnl.percent.toFixed(2)}%)
              </div>
            </div>
          )}
        </div>

        {/* Position Details */}
        <div className="bg-card-foreground border border-border rounded-lg p-4">
          <div className="text-lg font-semibold mb-2">Position Details</div>
          <div className="flex flex-col gap-4">
            {/* Token Balances */}
            <div>
              <div className="text-sm text-gray-500 mb-1">Token Balances</div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold">
                    {position.tokenX.amount === 0
                      ? '0'
                      : formatBalanceWithSub(position.tokenX.amount, 8)}{' '}
                    {position.tokenX.symbol}
                  </span>
                  <span className="text-xs text-gray-500">
                    (${position.tokenX.usdValue.toFixed(2)})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold">
                    {position.tokenY.amount === 0
                      ? '0'
                      : formatBalanceWithSub(position.tokenY.amount, 4)}{' '}
                    {position.tokenY.symbol}
                  </span>
                  <span className="text-xs text-gray-500">
                    (${position.tokenY.usdValue.toFixed(2)})
                  </span>
                </div>
              </div>
            </div>

            {/* Fees */}
            {isActive && (
              <div>
                <div className="text-sm text-gray-500 mb-1">Unclaimed Fees</div>
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-sm">
                    {position.fees.tokenX === 0
                      ? '0'
                      : formatBalanceWithSub(position.fees.tokenX, 8)}{' '}
                    {position.tokenX.symbol}
                  </span>
                  <span className="font-mono text-sm">
                    {position.fees.tokenY === 0
                      ? '0'
                      : formatBalanceWithSub(position.fees.tokenY, 4)}{' '}
                    {position.tokenY.symbol}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Action buttons for active positions */}
          {isActive && canInteract && (
            <div className="flex flex-col md:flex-row justify-end gap-2 mt-6">
              <Button
                variant="secondary"
                className="text-sm"
                onClick={onClaimFees}
                disabled={claiming || !canInteract}
              >
                {claiming ? 'Claiming...' : 'Claim Fees'}
              </Button>
              <Button
                className="text-sm"
                onClick={onCloseAndWithdraw}
                disabled={closing || !canInteract}
              >
                {closing ? 'Closing...' : 'Close & Withdraw'}
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Table row format
  return (
    <tr>
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="flex flex-col items-start">
          <div className="flex items-start">
            <Image
              src={`https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${position.tokenX.symbol}/logo.png`}
              alt={position.tokenX.symbol}
              width={24}
              height={24}
              className="rounded-full border-2 border-border"
              unoptimized
              onError={(e) => {
                e.currentTarget.src = '/token-placeholder.png';
              }}
            />
            <Image
              src={`https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${position.tokenY.symbol}/logo.png`}
              alt={position.tokenY.symbol}
              width={24}
              height={24}
              className="rounded-full border-2 border-border -ml-2"
              unoptimized
              onError={(e) => {
                e.currentTarget.src = '/token-placeholder.png';
              }}
            />
          </div>
          <span className="font-semibold">
            {position.tokenX.symbol} / {position.tokenY.symbol}
          </span>
          <span className="text-xs text-gray-500">
            {isClosed ? `Closed ${holdingDays}d` : `Active ${holdingDays}d`}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        {isActive && position.health ? (
          <PositionHealthBadge health={position.health} size="sm" />
        ) : (
          <span className="text-sm text-gray-500">-</span>
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap font-mono">
        ${position.totalLiquidityUSD.toFixed(4)}
      </td>
      <td className="px-4 py-3 whitespace-nowrap font-mono">
        ${position.fees.totalUSD.toFixed(4)}
      </td>
      <td className="px-4 py-3 whitespace-nowrap font-mono">
        {position.pnl ? (
          <span
            className={position.pnl.usd >= 0 ? 'text-green-400' : 'text-red-400'}
          >
            {position.pnl.usd >= 0 ? '+' : ''}${position.pnl.usd.toFixed(2)}
          </span>
        ) : (
          '-'
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        {isActive && canInteract && (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="text-xs"
              onClick={onClaimFees}
              disabled={claiming || !canInteract}
            >
              {claiming ? 'Claiming...' : 'Claim'}
            </Button>
            <Button
              className="text-xs"
              onClick={onCloseAndWithdraw}
              disabled={closing || !canInteract}
            >
              {closing ? 'Closing...' : 'Close'}
            </Button>
          </div>
        )}
      </td>
    </tr>
  );
}
