// src/hooks/useMagicblockWebSocket.ts
import { useEffect, useRef, useState, useCallback } from 'react';
import { Connection, PublicKey, AccountInfo } from '@solana/web3.js';
import { Buffer } from 'buffer';

const MAGICBLOCK_RPC_URL = 'https://devnet.magicblock.app';
const MAGICBLOCK_WS_URL = "wss://devnet.magicblock.app";

// Real Magicblock Pyth Lazer feed addresses from their repo
const PRICE_FEED_ADDRESSES: Record<string, string> = {
  'sol-usd': 'ENYwebBThHzmzwPLAQvCucUTsjyfBSZdD9ViXksS4jPu',
  'btc-usd': '71wtTRDY8Gxgw56bXFt2oc6qeAbTxzStdNiC425Z51sr',
  'eth-usd': '5vaYr1hpv8yrSpu8w3K95x22byYxUJCCNCSYJtqVWPvG',
  'usdc-usd': 'Ekug3x6hs37Mf4XKCDptvRVCSCjJCAD7LKmKQXBAa541',
};

export interface PriceFeed {
  pyth_lazer_id: string;
  name: string;
  symbol: string;
}

interface UseMagicblockWebSocketResult {
  price: number | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  feedAddress: string | null;
  updateCount: number;
}

export const useMagicblockWebSocket = (selectedFeed?: PriceFeed): UseMagicblockWebSocketResult => {
  const [price, setPrice] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedAddress, setFeedAddress] = useState<string | null>(null);
  const [updateCount, setUpdateCount] = useState(0);
  
  const connectionRef = useRef<Connection | null>(null);
  const subscriptionIdRef = useRef<number | null>(null);

  const parseAccountData = useCallback((accountInfo: AccountInfo<Buffer> | null): number | null => {
    if (!accountInfo || !accountInfo.data) {
      console.log('No account data received');
      return null;
    }

    try {
      console.log('Account data length:', accountInfo.data.length);
      console.log('First 100 bytes:', accountInfo.data.slice(0, 100));
      
      // Try parsing as DataView
      const dataView = new DataView(accountInfo.data.buffer, accountInfo.data.byteOffset, accountInfo.data.byteLength);
      
      // Price offset at byte 73 according to Magicblock repo
      const priceOffset = 73;
      
      if (accountInfo.data.length >= priceOffset + 8) {
        const priceInt = Number(dataView.getBigInt64(priceOffset, true));
        console.log('Parsed price (raw):', priceInt);
        return priceInt;
      } else {
        console.error('Account data too short for price parsing');
        return null;
      }
    } catch (err) {
      console.error('Error parsing account data:', err);
      return null;
    }
  }, []);

  const handleAccountChange = useCallback((accountInfo: AccountInfo<Buffer> | null) => {
    console.log('Account change received');
    const newPrice = parseAccountData(accountInfo);
    if (newPrice !== null) {
      setPrice(newPrice);
      setError(null);
      setUpdateCount(prev => prev + 1);
      console.log('Price updated:', newPrice, 'Update count:', updateCount + 1);
    }
  }, [parseAccountData, updateCount]);

  const subscribeToAccount = useCallback(async (feedAddress: PublicKey) => {
    if (!connectionRef.current) {
      console.error('No connection available');
      return;
    }

    try {
      setIsConnecting(true);
      setError(null);
      console.log('Subscribing to account:', feedAddress.toString());

      // Unsubscribe from previous account if exists
      if (subscriptionIdRef.current !== null) {
        console.log('Unsubscribing from previous feed');
        await connectionRef.current.removeAccountChangeListener(subscriptionIdRef.current);
        subscriptionIdRef.current = null;
      }

      // Get initial account data first
      console.log('Fetching initial account data...');
      const accountInfo = await connectionRef.current.getAccountInfo(feedAddress);
      
      if (!accountInfo) {
        throw new Error('Price feed account not found. It may not exist on devnet yet.');
      }
      
      console.log('Initial account info received, owner:', accountInfo.owner.toString());
      handleAccountChange(accountInfo);

      // Subscribe to the new account for updates
      console.log('Setting up WebSocket subscription...');
      subscriptionIdRef.current = connectionRef.current.onAccountChange(
        feedAddress,
        handleAccountChange,
        'confirmed'
      );

      setIsConnected(true);
      setIsConnecting(false);
      console.log('Successfully subscribed to price feed');
    } catch (err) {
      console.error('Error subscribing to account:', err);
      setError(err instanceof Error ? err.message : 'Failed to subscribe to account');
      setIsConnected(false);
      setIsConnecting(false);
    }
  }, [handleAccountChange]);

  // Initialize connection
  useEffect(() => {
    console.log('Initializing Magicblock connection...');
    try {
      connectionRef.current = new Connection(MAGICBLOCK_RPC_URL, {
        wsEndpoint: MAGICBLOCK_WS_URL,
        commitment: 'confirmed',
      });
      console.log('Connection created successfully');
    } catch (err) {
      console.error('Error creating connection:', err);
      setError('Failed to create Magicblock ephemeral rollup connection');
    }

    return () => {
      console.log('Cleaning up connection...');
      if (connectionRef.current && subscriptionIdRef.current !== null) {
        connectionRef.current.removeAccountChangeListener(subscriptionIdRef.current);
      }
    };
  }, []);

  // Subscribe to selected feed
  useEffect(() => {
    if (!selectedFeed || !connectionRef.current) {
      console.log('No feed selected or no connection');
      setPrice(null);
      setIsConnected(false);
      setIsConnecting(false);
      setFeedAddress(null);
      setUpdateCount(0);
      return;
    }

    try {
      // Get the direct address from our mapping
      const addressString = PRICE_FEED_ADDRESSES[selectedFeed.pyth_lazer_id];
      
      if (!addressString) {
        throw new Error(`Unknown feed ID: ${selectedFeed.pyth_lazer_id}. Available feeds: ${Object.keys(PRICE_FEED_ADDRESSES).join(', ')}`);
      }

      console.log(`Looking up feed for ${selectedFeed.pyth_lazer_id}: ${addressString}`);
      const feedPubkey = new PublicKey(addressString);
      setFeedAddress(feedPubkey.toString());
      setUpdateCount(0);
      subscribeToAccount(feedPubkey);
    } catch (err) {
      console.error('Error setting up feed subscription:', err);
      setError(err instanceof Error ? err.message : 'Failed to setup feed subscription');
      setIsConnected(false);
      setIsConnecting(false);
      setFeedAddress(null);
      setUpdateCount(0);
    }
  }, [selectedFeed, subscribeToAccount]);

  return {
    price,
    isConnected,
    isConnecting,
    error,
    feedAddress,
    updateCount,
  };
};