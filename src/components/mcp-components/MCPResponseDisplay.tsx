"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, CheckCircle } from '@phosphor-icons/react';
import type { PoolMetrics } from '@/lib/services/mcpClient';

interface MCPResponseDisplayProps {
  query: string;
  response: unknown;
  timestamp: Date;
  onAddLiquidity?: (poolAddress: string) => void;
}

export function MCPResponseDisplay({
  query,
  response,
  timestamp,
  onAddLiquidity,
}: MCPResponseDisplayProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(response, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isPoolMetrics = (data: unknown): data is PoolMetrics => {
    return (
      typeof data === 'object' &&
      data !== null &&
      'poolAddress' in data &&
      'poolName' in data &&
      'liquidity' in data
    );
  };

  const renderPoolMetrics = (metrics: PoolMetrics) => {
    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-xl font-bold text-white mb-1">
              {metrics.poolName}
            </h3>
            <p className="text-xs text-gray-400 font-mono">
              {metrics.poolAddress}
            </p>
          </div>
          {onAddLiquidity && (
            <Button
              variant="default"
              size="sm"
              onClick={() => onAddLiquidity(metrics.poolAddress)}
            >
              Add Liquidity
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-secondary/30 rounded-lg p-4">
            <p className="text-xs text-gray-400 mb-1">APY</p>
            <p className="text-2xl font-bold text-green-400">
              {metrics.metrics.apy.toFixed(2)}%
            </p>
          </div>
          <div className="bg-secondary/30 rounded-lg p-4">
            <p className="text-xs text-gray-400 mb-1">Total Liquidity</p>
            <p className="text-2xl font-bold text-white">
              ${metrics.liquidity.totalUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </div>
          <div className="bg-secondary/30 rounded-lg p-4">
            <p className="text-xs text-gray-400 mb-1">24h Volume</p>
            <p className="text-2xl font-bold text-blue-400">
              ${metrics.metrics.volume24h.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </div>
          <div className="bg-secondary/30 rounded-lg p-4">
            <p className="text-xs text-gray-400 mb-1">24h Fees</p>
            <p className="text-2xl font-bold text-purple-400">
              ${metrics.metrics.fees24h.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        <div className="bg-secondary/30 rounded-lg p-4">
          <p className="text-sm font-semibold text-white mb-2">Liquidity Breakdown</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-400 mb-1">
                {metrics.liquidity.tokenA.symbol}
              </p>
              <p className="text-lg font-semibold text-white">
                {metrics.liquidity.tokenA.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}
              </p>
              <p className="text-xs text-gray-500">
                ${metrics.liquidity.tokenA.usdValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">
                {metrics.liquidity.tokenB.symbol}
              </p>
              <p className="text-lg font-semibold text-white">
                {metrics.liquidity.tokenB.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}
              </p>
              <p className="text-xs text-gray-500">
                ${metrics.liquidity.tokenB.usdValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        {metrics.recommendation && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <p className="text-sm text-white whitespace-pre-wrap">
              {metrics.recommendation}
            </p>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Bin Step: {metrics.metrics.binStep} | Active Bin: {metrics.metrics.activeBin}</span>
          <span>{timestamp.toLocaleTimeString()}</span>
        </div>
      </div>
    );
  };

  const renderGenericResponse = (data: unknown) => {
    return (
      <pre className="bg-secondary/30 rounded-lg p-4 overflow-x-auto text-xs text-gray-300 font-mono">
        {JSON.stringify(data, null, 2)}
      </pre>
    );
  };

  return (
    <Card className="mb-4">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-base mb-2">Query</CardTitle>
            <p className="text-sm text-gray-400">{query}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCopy}
            className="ml-2"
            title="Copy response"
          >
            {copied ? (
              <CheckCircle size={18} className="text-green-500" weight="fill" />
            ) : (
              <Copy size={18} />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isPoolMetrics(response)
          ? renderPoolMetrics(response)
          : renderGenericResponse(response)}
      </CardContent>
    </Card>
  );
}
