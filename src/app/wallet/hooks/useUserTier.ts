import { useState, useEffect } from 'react';
import { PublicKey } from '@solana/web3.js';
import { mcpClient, type UserTierInfo } from '@/lib/mcp-client';

export function useUserTier(publicKey: PublicKey | null, connected: boolean) {
  const [userTier, setUserTier] = useState<UserTierInfo | null>(null);
  const [loadingTier, setLoadingTier] = useState(false);

  useEffect(() => {
    const fetchUserTier = async () => {
      if (!publicKey || !connected) {
        setUserTier(null);
        return;
      }

      setLoadingTier(true);
      try {
        const tierInfo = await mcpClient.getUserTier(publicKey.toBase58());
        setUserTier(tierInfo);
        console.log(
          `👤 User tier: ${tierInfo.tier} | Subscription: ${tierInfo.hasActiveSubscription} | Credits: ${tierInfo.creditBalance}`
        );
      } catch (error) {
        console.error('Failed to fetch user tier:', error);
        // Default to free tier on error
        setUserTier({
          tier: 'free',
          hasActiveSubscription: false,
          creditBalance: 0,
          canAccessFullPnL: false,
          canAccessAdvancedFeatures: false,
        });
      } finally {
        setLoadingTier(false);
      }
    };

    fetchUserTier();
  }, [connected, publicKey]);

  return {
    userTier,
    loadingTier,
  };
}
