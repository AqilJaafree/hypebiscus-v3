"use client";

import PageTemplate from "@/components/PageTemplate";
import React, { useState, useEffect } from 'react';
import { AlertTriangle, TrendingDown, TrendingUp, Activity, DollarSign, BarChart3, Zap, RefreshCw, Target, Cpu, Users, ArrowUpRight, ArrowDownRight, TrendingUpDown } from 'lucide-react';
import { useMagicblockWebSocket } from '@/hooks/useMagicblockWebSocket';
import WhaleMonitor from '@/components/premium-components/WhaleMonitor';
import PnLStats from '@/components/premium-components/PnLStats';

const BITCOIN_FEED = {
  pyth_lazer_id: 'btc-usd',
  name: 'Bitcoin',
  symbol: 'BTC'
};

const calculateRSI = (prices: number[], period = 14): number | null => {
  if (prices.length < period + 1) return null;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change >= 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
    }
  }
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
};

const calculateSMA = (prices: number[], period: number): number | null => {
  if (prices.length < period) return null;
  const sum = prices.slice(-period).reduce((acc, price) => acc + price, 0);
  return sum / period;
};

const calculateEMA = (prices: number[], period: number): number | null => {
  if (prices.length < period) return null;
  
  const multiplier = 2 / (period + 1);
  let ema = calculateSMA(prices.slice(0, period), period);
  
  if (!ema) return null;
  
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }
  
  return ema;
};

const calculateMACD = (prices: number[]): { macd: number | null; signal: number | null; histogram: number | null } => {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  
  if (!ema12 || !ema26) return { macd: null, signal: null, histogram: null };
  
  const macd = ema12 - ema26;
  
  const macdLine: number[] = [];
  for (let i = 26; i <= prices.length; i++) {
    const slice = prices.slice(0, i);
    const e12 = calculateEMA(slice, 12);
    const e26 = calculateEMA(slice, 26);
    if (e12 && e26) macdLine.push(e12 - e26);
  }
  
  const signal = calculateEMA(macdLine, 9);
  const histogram = signal ? macd - signal : null;
  
  return { macd, signal, histogram };
};

interface BTCData {
  price: number;
  change24h: number;
  change24hAmount: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  marketCap: number;
  circulatingSupply: number;
  maxSupply: number;
}

interface MovingAverages {
  sma20: number | null;
  sma50: number | null;
  ema12: number | null;
  ema26: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
}

type MarketSentiment = 'EXTREME_FEAR' | 'FEAR' | 'NEUTRAL' | 'GREED' | 'EXTREME_GREED';
type TrendDirection = 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
type MACDSignal = 'BULLISH_CROSSOVER' | 'BEARISH_CROSSOVER' | 'BULLISH' | 'BEARISH' | 'NEUTRAL';

const PremiumPage = () => {
  const { price: realtimePrice, isConnected, updateCount, error: pythError } = useMagicblockWebSocket(BITCOIN_FEED);
  
  const [btcData, setBtcData] = useState<BTCData | null>(null);
  const [historicalPrices, setHistoricalPrices] = useState<number[]>([]);
  const [rsi, setRsi] = useState<number | null>(null);
  const [movingAverages, setMovingAverages] = useState<MovingAverages>({
    sma20: null,
    sma50: null,
    ema12: null,
    ema26: null,
    macd: null,
    macdSignal: null,
    macdHistogram: null
  });
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [marketSentiment, setMarketSentiment] = useState<MarketSentiment>('NEUTRAL');
  const [trendDirection, setTrendDirection] = useState<TrendDirection>('SIDEWAYS');
  const [macdSignal, setMacdSignal] = useState<MACDSignal>('NEUTRAL');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (realtimePrice && btcData) {
      const formattedPrice = realtimePrice / Math.pow(10, 8);
      
      setBtcData(prev => {
        if (!prev) return prev;
        
        const change24hAmount = formattedPrice - prev.price;
        const change24h = (change24hAmount / prev.price) * 100;
        
        return {
          ...prev,
          price: formattedPrice,
          change24hAmount,
          change24h
        };
      });

      setHistoricalPrices(prev => {
        const newPrices = [...prev, formattedPrice];
        return newPrices.slice(-60);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realtimePrice, updateCount]);

  useEffect(() => {
    fetchBTCData();
    const interval = setInterval(fetchBTCData, 300000);
    return () => clearInterval(interval);
  }, []);

  const fetchBTCData = async () => {
    setError(null);
    try {
      const apiBaseUrl = process.env.NEXT_PUBLIC_DEFIDIVE_API_URL;
      
      if (!apiBaseUrl) {
        throw new Error('NEXT_PUBLIC_DEFIDIVE_API_URL is not configured');
      }
      
      const response = await fetch(`${apiBaseUrl}/coin/btc/info`);
      
      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data && data.price !== undefined) {
        const newData: BTCData = {
          price: data.price,
          change24h: data.change24h || 0,
          change24hAmount: data.change24hAmount || 0,
          volume24h: data.volume24h || 0,
          high24h: data.high24h || data.price,
          low24h: data.low24h || data.price,
          marketCap: data.marketCap || 0,
          circulatingSupply: data.circulatingSupply || 19000000,
          maxSupply: data.maxSupply || 21000000
        };
        
        setBtcData(newData);
        setLastUpdate(new Date());
        
        setHistoricalPrices(prev => {
          const newPrices = [...prev, newData.price];
          return newPrices.slice(-60);
        });
        
        setLoading(false);
      }
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to fetch Bitcoin data');
      setLoading(false);
    }
  };

  useEffect(() => {
    if (historicalPrices.length >= 14) {
      const calculatedRSI = calculateRSI(historicalPrices);
      setRsi(calculatedRSI);
      
      if (calculatedRSI !== null) {
        if (calculatedRSI <= 30) setMarketSentiment('EXTREME_FEAR');
        else if (calculatedRSI <= 40) setMarketSentiment('FEAR');
        else if (calculatedRSI <= 60) setMarketSentiment('NEUTRAL');
        else if (calculatedRSI <= 70) setMarketSentiment('GREED');
        else setMarketSentiment('EXTREME_GREED');
      }
    }
    
    const sma20 = calculateSMA(historicalPrices, 20);
    const sma50 = calculateSMA(historicalPrices, 50);
    const ema12 = calculateEMA(historicalPrices, 12);
    const ema26 = calculateEMA(historicalPrices, 26);
    const macdData = calculateMACD(historicalPrices);
    
    setMovingAverages({
      sma20,
      sma50,
      ema12,
      ema26,
      macd: macdData.macd,
      macdSignal: macdData.signal,
      macdHistogram: macdData.histogram
    });
    
    if (sma20 && sma50) {
      if (sma20 > sma50) setTrendDirection('BULLISH');
      else if (sma20 < sma50) setTrendDirection('BEARISH');
      else setTrendDirection('SIDEWAYS');
    }
    
    if (macdData.macd !== null && macdData.signal !== null && macdData.histogram !== null) {
      if (macdData.histogram > 0 && macdData.macd > macdData.signal) {
        if (historicalPrices.length >= 2) {
          const prevMACD = calculateMACD(historicalPrices.slice(0, -1));
          if (prevMACD.histogram !== null && prevMACD.histogram <= 0) {
            setMacdSignal('BULLISH_CROSSOVER');
          } else {
            setMacdSignal('BULLISH');
          }
        }
      } else if (macdData.histogram < 0 && macdData.macd < macdData.signal) {
        if (historicalPrices.length >= 2) {
          const prevMACD = calculateMACD(historicalPrices.slice(0, -1));
          if (prevMACD.histogram !== null && prevMACD.histogram >= 0) {
            setMacdSignal('BEARISH_CROSSOVER');
          } else {
            setMacdSignal('BEARISH');
          }
        }
      } else {
        setMacdSignal('NEUTRAL');
      }
    }
  }, [historicalPrices]);

  const getRSIStatus = (rsi: number): { status: string; color: string; description: string } => {
    if (rsi <= 30) return {
      status: 'OVERSOLD',
      color: 'text-green-500',
      description: 'Strong buy signal'
    };
    if (rsi <= 40) return {
      status: 'APPROACHING OVERSOLD',
      color: 'text-green-400',
      description: 'Accumulation zone'
    };
    if (rsi <= 60) return {
      status: 'NEUTRAL',
      color: 'text-gray-400',
      description: 'Balanced market'
    };
    if (rsi <= 70) return {
      status: 'APPROACHING OVERBOUGHT',
      color: 'text-orange-400',
      description: 'Consider profit-taking'
    };
    return {
      status: 'OVERBOUGHT',
      color: 'text-red-500',
      description: 'High correction risk'
    };
  };

  const getMACDColor = (signal: MACDSignal): string => {
    switch (signal) {
      case 'BULLISH_CROSSOVER': return 'text-green-500';
      case 'BULLISH': return 'text-green-400';
      case 'BEARISH_CROSSOVER': return 'text-red-500';
      case 'BEARISH': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  if (loading) {
    return (
      <PageTemplate>
        <div className="w-full text-white flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF4040]"></div>
            <p className="text-[#A0A0A0]">Loading...</p>
          </div>
        </div>
      </PageTemplate>
    );
  }

  if (error && !pythError) {
    return (
      <PageTemplate>
        <div className="w-full text-white flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-4">
            <AlertTriangle className="w-12 h-12 text-red-500" />
            <p className="text-red-500">{error}</p>
            <button
              onClick={fetchBTCData}
              className="px-4 py-2 bg-[#FF4040] hover:bg-[#FF4040]/80 rounded-lg transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </PageTemplate>
    );
  }

  const rsiStatus = rsi ? getRSIStatus(rsi) : null;
  const volatility = btcData ? ((btcData.high24h - btcData.low24h) / btcData.low24h * 100) : 0;
  const supplyPercentage = btcData ? (btcData.circulatingSupply / btcData.maxSupply * 100) : 0;

  return (
    <PageTemplate>
      <div className="w-full text-white py-4">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-3xl md:text-4xl font-bold text-[#FF4040]">
                BTC Analytics
              </h1>
              <button
                onClick={fetchBTCData}
                className="flex items-center gap-2 px-4 py-2 bg-[#161616] border border-[#1C1C1C] rounded-lg hover:bg-[#1C1C1C] transition-colors"
                disabled={loading}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span className="text-sm">Refresh</span>
              </button>
            </div>
            <div className="flex items-center gap-2 text-sm text-[#A0A0A0]">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`}></div>
              <span>{isConnected ? 'Live' : 'Reconnecting'}</span>
              <span>•</span>
              <span>{lastUpdate.toLocaleTimeString()}</span>
              {updateCount > 0 && (
                <>
                  <span>•</span>
                  <span className="text-[#FF4040]">{updateCount} updates</span>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="md:col-span-2 bg-[#0f0f0f] border border-[#1C1C1C] rounded-2xl p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-lg text-[#A0A0A0] mb-2">
                    BTC {isConnected && <span className="text-xs text-green-500">(Live)</span>}
                  </h2>
                  <div className="flex items-baseline gap-3">
                    <span className="text-5xl font-bold">
                      ${btcData?.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </span>
                    <div className={`flex items-center gap-1 ${btcData && btcData.change24h >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {btcData && btcData.change24h >= 0 ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                      <span className="text-xl font-semibold">
                        {btcData?.change24h.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-[#A0A0A0] mt-1">
                    ${btcData?.change24hAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div className={`px-4 py-2 rounded-lg ${trendDirection === 'BULLISH' ? 'bg-green-500/20 text-green-500' : trendDirection === 'BEARISH' ? 'bg-red-500/20 text-red-500' : 'bg-gray-500/20 text-gray-400'}`}>
                  <div className="flex items-center gap-2">
                    {trendDirection === 'BULLISH' ? <TrendingUp className="w-5 h-5" /> : trendDirection === 'BEARISH' ? <TrendingDown className="w-5 h-5" /> : <TrendingUpDown className="w-5 h-5" />}
                    <span className="font-semibold">{trendDirection}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-[#1C1C1C]">
                <div>
                  <p className="text-xs text-[#A0A0A0] mb-1">24h High</p>
                  <p className="text-lg font-semibold">${btcData?.high24h.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <p className="text-xs text-[#A0A0A0] mb-1">24h Low</p>
                  <p className="text-lg font-semibold">${btcData?.low24h.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <p className="text-xs text-[#A0A0A0] mb-1">24h Volume</p>
                  <p className="text-lg font-semibold">${((btcData?.volume24h || 0) / 1000000000).toFixed(2)}B</p>
                </div>
              </div>
            </div>

            <div className="bg-[#0f0f0f] border border-[#1C1C1C] rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-5 h-5 text-[#FF4040]" />
                <h3 className="text-lg font-semibold">RSI (14)</h3>
              </div>
              <div className="text-center">
                <div className="text-5xl font-bold mb-2" style={{ color: rsiStatus?.color }}>
                  {rsi?.toFixed(1)}
                </div>
                <div className={`inline-block px-3 py-1 rounded-lg text-sm font-semibold mb-3`} style={{ 
                  backgroundColor: rsiStatus?.color.replace('text-', 'bg-') + '/20',
                  color: rsiStatus?.color 
                }}>
                  {rsiStatus?.status}
                </div>
                <p className="text-xs text-[#A0A0A0]">{rsiStatus?.description}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <div className="bg-[#0f0f0f] border border-[#1C1C1C] rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-4 h-4 text-[#FF4040]" />
                <h4 className="text-sm font-semibold text-[#A0A0A0]">SMA (20)</h4>
              </div>
              <p className="text-2xl font-bold mb-2">
                ${movingAverages.sma20?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || 'N/A'}
              </p>
              <div className="w-full bg-[#0f0f0f] rounded-full h-2 mb-2">
                <div
                  className={`h-2 rounded-full ${btcData && movingAverages.sma20 && btcData.price > movingAverages.sma20 ? 'bg-green-500' : 'bg-red-500'}`}
                  style={{ width: '100%' }}
                ></div>
              </div>
              <p className="text-xs text-[#A0A0A0]">
                {btcData && movingAverages.sma20 && btcData.price > movingAverages.sma20 ? 'Above' : 'Below'}
              </p>
            </div>

            <div className="bg-[#0f0f0f] border border-[#1C1C1C] rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-4 h-4 text-[#FF4040]" />
                <h4 className="text-sm font-semibold text-[#A0A0A0]">SMA (50)</h4>
              </div>
              <p className="text-2xl font-bold mb-2">
                ${movingAverages.sma50?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || 'N/A'}
              </p>
              <div className="w-full bg-[#0f0f0f] rounded-full h-2 mb-2">
                <div
                  className={`h-2 rounded-full ${btcData && movingAverages.sma50 && btcData.price > movingAverages.sma50 ? 'bg-green-500' : 'bg-red-500'}`}
                  style={{ width: '100%' }}
                ></div>
              </div>
              <p className="text-xs text-[#A0A0A0]">
                {btcData && movingAverages.sma50 && btcData.price > movingAverages.sma50 ? 'Above' : 'Below'}
              </p>
            </div>

            <div className="bg-[#0f0f0f] border border-[#1C1C1C] rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-4 h-4 text-[#FF4040]" />
                <h4 className="text-sm font-semibold text-[#A0A0A0]">MA Cross</h4>
              </div>
              <p className="text-xl font-bold mb-2">
                {movingAverages.sma20 && movingAverages.sma50 && movingAverages.sma20 > movingAverages.sma50 ? 'Golden' : 'Death'}
              </p>
              <div className="w-full bg-[#0f0f0f] rounded-full h-2 mb-2">
                <div 
                  className={`h-2 rounded-full ${movingAverages.sma20 && movingAverages.sma50 && movingAverages.sma20 > movingAverages.sma50 ? 'bg-green-500' : 'bg-red-500'}`}
                  style={{ width: '100%' }}
                ></div>
              </div>
              <p className="text-xs text-[#A0A0A0]">
                {movingAverages.sma20 && movingAverages.sma50 && movingAverages.sma20 > movingAverages.sma50
                  ? 'Bullish'
                  : 'Bearish'
                }
              </p>
            </div>

            <div className="bg-[#0f0f0f] border border-[#1C1C1C] rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-[#FF4040]" />
                <h4 className="text-sm font-semibold text-[#A0A0A0]">Sentiment</h4>
              </div>
              <p className={`text-xl font-bold mb-2 ${
                marketSentiment === 'EXTREME_FEAR' ? 'text-red-600' :
                marketSentiment === 'FEAR' ? 'text-red-400' :
                marketSentiment === 'NEUTRAL' ? 'text-gray-400' :
                marketSentiment === 'GREED' ? 'text-green-400' :
                'text-green-600'
              }`}>
                {marketSentiment.replace('_', ' ')}
              </p>
              <div className="w-full bg-[#0f0f0f] rounded-full h-2 mb-2">
                <div 
                  className={`h-2 rounded-full ${
                    marketSentiment === 'EXTREME_FEAR' ? 'bg-red-600' :
                    marketSentiment === 'FEAR' ? 'bg-red-400' :
                    marketSentiment === 'NEUTRAL' ? 'bg-gray-400' :
                    marketSentiment === 'GREED' ? 'bg-green-400' :
                    'bg-green-600'
                  }`}
                  style={{ width: '100%' }}
                ></div>
              </div>
              <p className="text-xs text-[#A0A0A0]">
                RSI-based
              </p>
            </div>
          </div>

          <div className="bg-[#0f0f0f] border border-[#1C1C1C] rounded-2xl p-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5 text-[#FF4040]" />
              <h3 className="text-lg font-semibold">MACD Analysis</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-[#A0A0A0] mb-2">MACD Line</p>
                <p className="text-2xl font-bold">
                  {movingAverages.macd?.toFixed(2) || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm text-[#A0A0A0] mb-2">Signal Line</p>
                <p className="text-2xl font-bold">
                  {movingAverages.macdSignal?.toFixed(2) || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm text-[#A0A0A0] mb-2">Histogram</p>
                <p className={`text-2xl font-bold ${movingAverages.macdHistogram && movingAverages.macdHistogram > 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {movingAverages.macdHistogram?.toFixed(2) || 'N/A'}
                </p>
              </div>
            </div>

            <div className={`mt-4 p-4 rounded-lg ${getMACDColor(macdSignal).replace('text-', 'bg-')}/20`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-3 h-3 rounded-full ${getMACDColor(macdSignal).replace('text-', 'bg-')}`}></div>
                <p className={`font-semibold ${getMACDColor(macdSignal)}`}>
                  {macdSignal.replace('_', ' ')}
                </p>
              </div>
              <p className="text-sm text-[#A0A0A0]">
                {macdSignal === 'BULLISH_CROSSOVER' && 'Strong buy - MACD crossed above signal'}
                {macdSignal === 'BEARISH_CROSSOVER' && 'Strong sell - MACD crossed below signal'}
                {macdSignal === 'BULLISH' && 'Positive momentum'}
                {macdSignal === 'BEARISH' && 'Negative momentum'}
                {macdSignal === 'NEUTRAL' && 'Neutral momentum'}
              </p>
            </div>
          </div>

          <div className="bg-[#0f0f0f] border border-[#1C1C1C] rounded-2xl p-6 mb-6">
            <div className="flex items-center gap-2 mb-6">
              <Cpu className="w-5 h-5 text-[#FF4040]" />
              <h3 className="text-lg font-semibold">Market Insights</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className={`w-2 h-2 rounded-full mt-2 ${rsiStatus?.color.replace('text-', 'bg-')}`}></div>
                  <div className="flex-1">
                    <p className="font-medium">RSI: {rsiStatus?.status}</p>
                    <p className="text-sm text-[#A0A0A0] mt-1">{rsiStatus?.description}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className={`w-2 h-2 rounded-full mt-2 ${
                    trendDirection === 'BULLISH' ? 'bg-green-500' :
                    trendDirection === 'BEARISH' ? 'bg-red-500' :
                    'bg-gray-500'
                  }`}></div>
                  <div className="flex-1">
                    <p className="font-medium">Trend: {trendDirection}</p>
                    <p className="text-sm text-[#A0A0A0] mt-1">
                      {movingAverages.sma20 && movingAverages.sma50 && movingAverages.sma20 > movingAverages.sma50
                        ? 'Golden Cross - bullish'
                        : 'Death Cross - bearish'
                      }
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full mt-2 bg-blue-400"></div>
                  <div className="flex-1">
                    <p className="font-medium">Volatility: {volatility.toFixed(2)}%</p>
                    <p className="text-sm text-[#A0A0A0] mt-1">
                      {volatility > 5 ? 'High' : volatility > 3 ? 'Moderate' : 'Low'} • Vol: ${((btcData?.volume24h || 0) / 1000000000).toFixed(2)}B
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className={`w-2 h-2 rounded-full mt-2 ${getMACDColor(macdSignal).replace('text-', 'bg-')}`}></div>
                  <div className="flex-1">
                    <p className="font-medium">MACD: {macdSignal.replace('_', ' ')}</p>
                    <p className="text-sm text-[#A0A0A0] mt-1">
                      {macdSignal === 'BULLISH_CROSSOVER' && 'Strong buy signal'}
                      {macdSignal === 'BEARISH_CROSSOVER' && 'Strong sell signal'}
                      {macdSignal === 'BULLISH' && 'Positive momentum'}
                      {macdSignal === 'BEARISH' && 'Negative momentum'}
                      {macdSignal === 'NEUTRAL' && 'Neutral momentum'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full mt-2 bg-orange-400"></div>
                  <div className="flex-1">
                    <p className="font-medium">Supply</p>
                    <p className="text-sm text-[#A0A0A0] mt-1">
                      {supplyPercentage.toFixed(2)}% mined • {btcData?.circulatingSupply.toLocaleString()}M BTC
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full mt-2 bg-cyan-400"></div>
                  <div className="flex-1">
                    <p className="font-medium">Market Cap</p>
                    <p className="text-sm text-[#A0A0A0] mt-1">
                      ${((btcData?.marketCap || 0) / 1000000000000).toFixed(2)}T
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-[#0f0f0f] border border-[#1C1C1C] rounded-2xl p-6 mb-6">
            <div className="flex items-center gap-2 mb-6">
              <DollarSign className="w-5 h-5 text-[#FF4040]" />
              <h3 className="text-lg font-semibold">Trading Signals</h3>
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <span className="text-[#FF4040] font-bold">•</span>
                <p className="text-sm text-[#A0A0A0]">
                  <span className="text-white font-medium">Short-Term:</span> {
                    rsiStatus?.status === 'OVERSOLD' ? 'RSI oversold - potential bounce' :
                    rsiStatus?.status === 'OVERBOUGHT' ? 'RSI overbought - consider profit-taking' :
                    'Monitor RSI extremes'
                  } • {
                    movingAverages.sma20 && movingAverages.sma50 && movingAverages.sma20 > movingAverages.sma50
                      ? 'Above 20-MA'
                      : 'Below 20-MA'
                  }
                </p>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-[#FF4040] font-bold">•</span>
                <p className="text-sm text-[#A0A0A0]">
                  <span className="text-white font-medium">Liquidity Providers:</span> {
                    volatility > 5 ? 'High volatility - widen spreads, monitor IL' :
                    volatility > 3 ? 'Moderate volatility - standard strategies' :
                    'Low volatility - tighter spreads possible'
                  }
                </p>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-[#FF4040] font-bold">•</span>
                <p className="text-sm text-[#A0A0A0]">
                  <span className="text-white font-medium">MACD:</span> {
                    macdSignal === 'BULLISH_CROSSOVER' ? 'Bullish crossover - strong buy' :
                    macdSignal === 'BEARISH_CROSSOVER' ? 'Bearish crossover - risk management' :
                    movingAverages.macdHistogram && movingAverages.macdHistogram > 0 ? 'Positive momentum building' :
                    'Negative momentum - wait for reversal'
                  }
                </p>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-[#FF4040] font-bold">•</span>
                <p className="text-sm text-[#A0A0A0]">
                  <span className="text-white font-medium">Long-Term:</span> {
                    btcData && btcData.change24h < -5 ? 'Dip - potential DCA opportunity' :
                    marketSentiment === 'EXTREME_FEAR' ? 'Extreme fear - consider accumulation' :
                    marketSentiment === 'EXTREME_GREED' ? 'Extreme greed - prepare for corrections' :
                    'HODL strategy valid'
                  } • {supplyPercentage.toFixed(1)}% mined
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 p-4 bg-[#161616] border border-[#1C1C1C] rounded-2xl">
            <p className="text-xs text-[#A0A0A0]">
              <span className="font-bold text-white">Disclaimer:</span> Educational information only. Not financial advice. Crypto markets are volatile. DYOR. Never invest more than you can afford to lose. Real-time data via Pyth Lazer on Magicblock.
            </p>
          </div>

          <div className="mt-6">
            <PnLStats />
          </div>

          <div className="mt-6">
            <WhaleMonitor btcPrice={btcData?.price || 0} />
          </div>
        </div>
      </div>
    </PageTemplate>
  );
};

export default PremiumPage;