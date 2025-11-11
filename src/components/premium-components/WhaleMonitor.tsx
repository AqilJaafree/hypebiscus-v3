// src/components/premium-components/WhaleMonitor.tsx
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { Connection, PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js';
import { Waves, TrendingUp, TrendingDown, ExternalLink, Star, StarOff } from 'lucide-react';

const BTC_TOKEN_MINTS = {
  'wBTC': '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh',
  'zBTC': 'zBTCug3er3tLyffELcvDNrKkCymbPWysGcWihESYfLg',
  'cbBTC': 'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij',
};

const DEX_PROGRAMS = {
  JUPITER_V6: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
  JUPITER_V4: 'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB',
  RAYDIUM_V4: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  RAYDIUM_CLMM: 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
  ORCA_WHIRLPOOL: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
  ORCA_WHIRLPOOLS: '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP',
  METEORA_DLMM: 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',
};

const WHALE_THRESHOLD = 500;

interface WhaleTransaction {
  signature: string;
  timestamp: number;
  token: string;
  amount: number;
  usdValue: number;
  from: string;
  fromFull: string;
  to: string;
  toFull: string;
  type: 'buy' | 'sell' | 'transfer';
  dex?: string;
}

interface WhaleMonitorProps {
  btcPrice: number;
}

interface WalletStats {
  wallet: string;
  dexCounts: Record<string, number>;
  totalTx: number;
  lastSeen: number;
}

interface MarketStats {
  dexCounts: Record<string, number>;
  totalTx: number;
  totalVolume: number;
}

const WhaleMonitor: React.FC<WhaleMonitorProps> = ({ btcPrice }) => {
  const [transactions, setTransactions] = useState<WhaleTransaction[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(true);
  const [trackedWallets, setTrackedWallets] = useState<Set<string>>(new Set());
  const [walletStats, setWalletStats] = useState<Map<string, WalletStats>>(new Map());
  const [marketStats, setMarketStats] = useState<MarketStats>({
    dexCounts: {},
    totalTx: 0,
    totalVolume: 0
  });
  const connectionRef = useRef<Connection | null>(null);
  const signaturesSeen = useRef<Set<string>>(new Set());
  const statsProcessed = useRef<Set<string>>(new Set());

  // Load tracked wallets and stats from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('trackedWhaleWallets');
    const savedStats = localStorage.getItem('whaleWalletStats');
    const savedMarket = localStorage.getItem('whaleMarketStats');

    if (saved) {
      setTrackedWallets(new Set(JSON.parse(saved)));
    }
    if (savedStats) {
      const parsed = JSON.parse(savedStats);
      setWalletStats(new Map(Object.entries(parsed)));
    }
    if (savedMarket) {
      setMarketStats(JSON.parse(savedMarket));
    }
  }, []);

  // Save tracked wallets and stats
  const saveTrackedWallets = (wallets: Set<string>) => {
    localStorage.setItem('trackedWhaleWallets', JSON.stringify(Array.from(wallets)));
    setTrackedWallets(new Set(wallets));
  };

  const saveWalletStats = useCallback((stats: Map<string, WalletStats>) => {
    const obj = Object.fromEntries(stats);
    localStorage.setItem('whaleWalletStats', JSON.stringify(obj));
    setWalletStats(new Map(stats));
  }, []);

  const updateWalletStats = useCallback((wallet: string, dex: string, timestamp: number) => {
    setWalletStats(prevStats => {
      const newStats = new Map(prevStats);
      const current = newStats.get(wallet) || {
        wallet,
        dexCounts: {},
        totalTx: 0,
        lastSeen: 0
      };

      current.dexCounts[dex] = (current.dexCounts[dex] || 0) + 1;
      current.totalTx += 1;
      current.lastSeen = timestamp;

      newStats.set(wallet, current);

      // Also save to localStorage
      const obj = Object.fromEntries(newStats);
      localStorage.setItem('whaleWalletStats', JSON.stringify(obj));

      return newStats;
    });
  }, []);

  const toggleTracking = (wallet: string) => {
    const newTracked = new Set(trackedWallets);
    if (newTracked.has(wallet)) {
      newTracked.delete(wallet);
      // Remove stats when untracking
      const newStats = new Map(walletStats);
      newStats.delete(wallet);
      saveWalletStats(newStats);
    } else {
      newTracked.add(wallet);
    }
    saveTrackedWallets(newTracked);
  };

  useEffect(() => {
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    connectionRef.current = new Connection(rpcUrl, 'confirmed');
  }, []);

  const detectDEX = useCallback((tx: ParsedTransactionWithMeta): string => {
    const instructions = tx.transaction.message.instructions;

    for (const ix of instructions) {
      const programId = ix.programId.toString();

      if (programId === DEX_PROGRAMS.JUPITER_V6 || programId === DEX_PROGRAMS.JUPITER_V4) return 'Jupiter';
      if (programId === DEX_PROGRAMS.RAYDIUM_V4) return 'Raydium';
      if (programId === DEX_PROGRAMS.RAYDIUM_CLMM) return 'Raydium';
      if (programId === DEX_PROGRAMS.ORCA_WHIRLPOOL || programId === DEX_PROGRAMS.ORCA_WHIRLPOOLS) return 'Orca';
      if (programId === DEX_PROGRAMS.METEORA_DLMM) return 'Meteora';
    }

    return 'Transfer';
  }, []);

  const parseTransaction = useCallback((
    tx: ParsedTransactionWithMeta,
    signature: string,
    tokenSymbol: string
  ): WhaleTransaction | null => {
    if (!tx || !tx.meta || !tx.blockTime) return null;

    try {
      const preBalances = tx.meta.preTokenBalances || [];
      const postBalances = tx.meta.postTokenBalances || [];

      for (let i = 0; i < postBalances.length; i++) {
        const preBalance = preBalances.find(pb => pb.accountIndex === postBalances[i].accountIndex);
        if (!preBalance) continue;

        const preAmount = preBalance.uiTokenAmount.uiAmount || 0;
        const postAmount = postBalances[i].uiTokenAmount.uiAmount || 0;
        const diff = Math.abs(postAmount - preAmount);

        if (diff === 0) continue;

        const usdValue = diff * btcPrice;
        if (usdValue < WHALE_THRESHOLD) continue;

        const accountKeys = tx.transaction.message.accountKeys;
        const fromAddressFull = accountKeys[0]?.pubkey.toString() || 'Unknown';
        const toAddressFull = postBalances[i].owner || 'Unknown';

        let type: 'buy' | 'sell' | 'transfer' = 'transfer';
        if (postAmount > preAmount) type = 'buy';
        else if (postAmount < preAmount) type = 'sell';

        return {
          signature,
          timestamp: tx.blockTime * 1000,
          token: tokenSymbol,
          amount: diff,
          usdValue,
          from: fromAddressFull.slice(0, 4) + '...' + fromAddressFull.slice(-4),
          fromFull: fromAddressFull,
          to: toAddressFull.slice(0, 4) + '...' + toAddressFull.slice(-4),
          toFull: toAddressFull,
          type,
        };
      }
    } catch (error) {
      console.error('Error parsing transaction:', error);
    }

    return null;
  }, [btcPrice]);

  const monitorAllTokens = useCallback(async () => {
    if (!connectionRef.current) return;

    try {
      const allTransactions: WhaleTransaction[] = [];

      for (const [symbol, mint] of Object.entries(BTC_TOKEN_MINTS)) {
        try {
          const signatures = await connectionRef.current.getSignaturesForAddress(
            new PublicKey(mint),
            { limit: 3 }
          );

          const newSignatures = signatures.filter(sig => !signaturesSeen.current.has(sig.signature));

          if (newSignatures.length > 0) {
            newSignatures.forEach(sig => signaturesSeen.current.add(sig.signature));

            for (let i = 0; i < newSignatures.length; i++) {
              try {
                const tx = await connectionRef.current!.getParsedTransaction(newSignatures[i].signature, {
                  maxSupportedTransactionVersion: 0,
                });

                if (tx) {
                  const dex = detectDEX(tx);
                  const whaleTx = parseTransaction(tx, newSignatures[i].signature, symbol);

                  if (whaleTx) {
                    whaleTx.dex = dex;
                    allTransactions.push(whaleTx);
                  }
                }

                if (i < newSignatures.length - 1) {
                  await new Promise(resolve => setTimeout(resolve, 200));
                }
              } catch (error) {
                console.warn(`Failed to fetch transaction:`, error);
              }
            }
          }

          const tokenEntries = Object.entries(BTC_TOKEN_MINTS);
          const currentIndex = tokenEntries.findIndex(([s]) => s === symbol);
          if (currentIndex < tokenEntries.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }

        } catch (error) {
          console.error(`Error monitoring ${symbol}:`, error);
        }
      }

      if (allTransactions.length > 0) {
        setTransactions(prev => {
          const combined = [...allTransactions, ...prev];
          const thirtySecondsAgo = Date.now() - (30 * 1000);
          const filtered = combined.filter(tx => tx.timestamp > thirtySecondsAgo);
          return filtered.slice(0, 5);
        });
      }

    } catch (error) {
      console.error('Error in monitoring:', error);
    }
  }, [parseTransaction, detectDEX]);

  // Update market stats for all transactions
  useEffect(() => {
    transactions.forEach(tx => {
      const key = `${tx.signature}-market`;
      if (!statsProcessed.current.has(key) && tx.dex) {
        setMarketStats(prev => {
          const newStats = {
            ...prev,
            dexCounts: {
              ...prev.dexCounts,
              [tx.dex!]: (prev.dexCounts[tx.dex!] || 0) + 1
            },
            totalTx: prev.totalTx + 1,
            totalVolume: prev.totalVolume + tx.usdValue
          };
          localStorage.setItem('whaleMarketStats', JSON.stringify(newStats));
          return newStats;
        });
        statsProcessed.current.add(key);
      }
    });
  }, [transactions]);

  // Track stats for tracked wallets when transactions update
  useEffect(() => {
    transactions.forEach(tx => {
      const key = `${tx.signature}-${tx.fromFull}`;
      if (!statsProcessed.current.has(key) && trackedWallets.has(tx.fromFull) && tx.dex) {
        updateWalletStats(tx.fromFull, tx.dex, tx.timestamp);
        statsProcessed.current.add(key);
      }
    });
  }, [transactions, trackedWallets, updateWalletStats]);

  useEffect(() => {
    if (!isMonitoring) return;

    monitorAllTokens();

    const interval = setInterval(async () => {
      await monitorAllTokens();
    }, 15000);

    return () => clearInterval(interval);
  }, [isMonitoring, monitorAllTokens]);

  const formatTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return 'Now';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  };

  const formatUSD = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
    return `$${value.toFixed(0)}`;
  };

  const isTracked = (wallet: string) => trackedWallets.has(wallet);
  const isTrackedTransaction = (tx: WhaleTransaction) =>
    isTracked(tx.fromFull) || isTracked(tx.toFull);

  const getDexColor = (dex: string) => {
    const colors: Record<string, string> = {
      'Jupiter': '#FF4040',
      'Raydium': '#9945FF',
      'Orca': '#3B82F6',
      'Meteora': '#10B981',
      'Transfer': '#6B7280'
    };
    return colors[dex] || '#6B7280';
  };

  const trackedWalletsList = Array.from(walletStats.values())
    .filter(stat => trackedWallets.has(stat.wallet))
    .sort((a, b) => b.totalTx - a.totalTx);

  const resetMarketStats = () => {
    setMarketStats({
      dexCounts: {},
      totalTx: 0,
      totalVolume: 0
    });
    localStorage.removeItem('whaleMarketStats');
    // Clear only market-related stats from processed
    const newProcessed = new Set<string>();
    statsProcessed.current.forEach(key => {
      if (!key.endsWith('-market')) {
        newProcessed.add(key);
      }
    });
    statsProcessed.current = newProcessed;
  };

  return (
    <div className="bg-[#0f0f0f] border border-[#1C1C1C] rounded-2xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Waves className="w-5 h-5 text-[#FF4040]" />
          <div>
            <h3 className="text-lg font-semibold">Whale Activity</h3>
            <p className="text-xs text-[#A0A0A0]">
              ${(WHALE_THRESHOLD / 1000).toFixed(0)}K+ BTC trades
              {trackedWallets.size > 0 && ` • ${trackedWallets.size} tracked`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isMonitoring && (
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          )}
          <button
            onClick={() => setIsMonitoring(!isMonitoring)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              isMonitoring
                ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30'
                : 'bg-[#FF4040]/20 text-[#FF4040] hover:bg-[#FF4040]/30'
            }`}
          >
            {isMonitoring ? 'Stop' : 'Start'}
          </button>
        </div>
      </div>

      {/* Market Heatmap */}
      {marketStats.totalTx > 0 && (
        <div className="mb-4 p-4 bg-[#161616] rounded-lg border border-[#1C1C1C]">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Waves className="w-4 h-4 text-[#FF4040]" />
              Market DEX Activity
            </h4>
            <button
              onClick={resetMarketStats}
              className="text-xs text-[#666] hover:text-[#FF4040] transition-colors"
              title="Reset market stats"
            >
              Reset
            </button>
          </div>
          <div className="space-y-2">
            <div className="flex gap-1 h-3">
              {Object.entries(marketStats.dexCounts)
                .sort(([, a], [, b]) => b - a)
                .map(([dex, count]) => {
                  const percentage = (count / marketStats.totalTx) * 100;
                  return (
                    <div
                      key={dex}
                      className="rounded-sm transition-all hover:opacity-80 cursor-pointer"
                      style={{
                        width: `${percentage}%`,
                        backgroundColor: getDexColor(dex)
                      }}
                      title={`${dex}: ${count} tx (${percentage.toFixed(1)}%)`}
                    />
                  );
                })}
            </div>
            <div className="flex flex-wrap gap-3 text-xs">
              {Object.entries(marketStats.dexCounts)
                .sort(([, a], [, b]) => b - a)
                .map(([dex, count]) => (
                  <div key={dex} className="flex items-center gap-1.5">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: getDexColor(dex) }}
                    />
                    <span className="text-[#A0A0A0]">{dex}</span>
                    <span className="font-semibold">{count}</span>
                    <span className="text-[#666]">
                      ({((count / marketStats.totalTx) * 100).toFixed(0)}%)
                    </span>
                  </div>
                ))}
            </div>
            <div className="pt-2 border-t border-[#1C1C1C] flex items-center justify-between text-xs">
              <span className="text-[#666]">Total: {marketStats.totalTx} whale transactions</span>
              <span className="text-[#666]">
                Vol: ${marketStats.totalVolume >= 1000000
                  ? `${(marketStats.totalVolume / 1000000).toFixed(1)}M`
                  : `${(marketStats.totalVolume / 1000).toFixed(0)}K`}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Tracked Wallet Heatmap */}
      {trackedWalletsList.length > 0 && (
        <div className="mb-6 p-4 bg-[#161616] rounded-lg border border-[#1C1C1C]">
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Star className="w-4 h-4 text-yellow-500 fill-current" />
            Tracked Wallet DEX Preferences
          </h4>
          <div className="space-y-3">
            {trackedWalletsList.map(stat => {
              const dexes = Object.keys(stat.dexCounts);
              return (
                <div key={stat.wallet} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <code className="text-xs text-[#FF4040] font-mono">{stat.wallet.slice(0, 8)}...{stat.wallet.slice(-8)}</code>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#666]">{stat.totalTx} tx</span>
                      <button
                        onClick={() => toggleTracking(stat.wallet)}
                        className="text-yellow-500 hover:text-yellow-400 transition-colors"
                        title="Untrack wallet"
                      >
                        <Star className="w-3.5 h-3.5 fill-current" />
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-1 h-2">
                    {dexes.map(dex => {
                      const percentage = (stat.dexCounts[dex] / stat.totalTx) * 100;
                      return (
                        <div
                          key={dex}
                          className="rounded-sm transition-all hover:opacity-80"
                          style={{
                            width: `${percentage}%`,
                            backgroundColor: getDexColor(dex)
                          }}
                          title={`${dex}: ${stat.dexCounts[dex]} tx (${percentage.toFixed(0)}%)`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {dexes.map(dex => (
                      <div key={dex} className="flex items-center gap-1">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: getDexColor(dex) }}
                        />
                        <span className="text-[#A0A0A0]">{dex}</span>
                        <span className="text-[#666]">{stat.dexCounts[dex]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {transactions.length === 0 ? (
          <div className="text-center py-8 text-[#A0A0A0]">
            <Waves className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{isMonitoring ? 'Monitoring...' : 'Start to track whale trades'}</p>
          </div>
        ) : (
          transactions.map((tx) => {
            const tracked = isTrackedTransaction(tx);
            return (
              <div
                key={tx.signature}
                className={`p-3 bg-[#161616] rounded-lg border transition-all ${
                  tracked
                    ? 'border-yellow-500/50 bg-yellow-500/5'
                    : 'border-[#1C1C1C] hover:border-[#FF4040]/30'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        tx.type === 'buy' ? 'bg-green-500/20' : 'bg-red-500/20'
                      }`}
                    >
                      {tx.type === 'buy' ? (
                        <TrendingUp className="w-4 h-4 text-green-500" />
                      ) : (
                        <TrendingDown className="w-4 h-4 text-red-500" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-semibold ${tx.type === 'buy' ? 'text-green-500' : 'text-red-500'}`}>
                          {tx.type.toUpperCase()}
                        </span>
                        <span className="text-xs text-[#666]">•</span>
                        <span className="text-xs text-[#A0A0A0]">{tx.token}</span>
                        {tx.dex && (
                          <>
                            <span className="text-xs text-[#666]">•</span>
                            <span className="text-xs text-[#FF4040]">{tx.dex}</span>
                          </>
                        )}
                      </div>
                      <p className="text-xs text-[#666] mt-0.5">{formatTime(tx.timestamp)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-bold">{formatUSD(tx.usdValue)}</div>
                    <div className="text-xs text-[#666]">{tx.amount.toFixed(3)} BTC</div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-2 border-t border-[#1C1C1C]">
                  <div className="flex items-center gap-2">
                    <code className="text-[#FF4040] font-mono">{tx.from}</code>
                    <button
                      onClick={() => toggleTracking(tx.fromFull)}
                      className={`p-1 rounded transition-colors ${
                        isTracked(tx.fromFull)
                          ? 'text-yellow-500 hover:text-yellow-400'
                          : 'text-[#666] hover:text-[#FF4040]'
                      }`}
                      title={isTracked(tx.fromFull) ? 'Untrack wallet' : 'Track wallet'}
                    >
                      {isTracked(tx.fromFull) ? <Star className="w-3.5 h-3.5 fill-current" /> : <StarOff className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <a
                    href={`https://solscan.io/tx/${tx.signature}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#666] hover:text-[#FF4040] transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default WhaleMonitor;