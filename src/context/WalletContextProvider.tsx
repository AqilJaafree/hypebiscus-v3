// Optimized WalletContextProvider.tsx to remove redundant adapters

'use client'

import { FC, ReactNode, useMemo, useEffect } from 'react'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { 
  // Remove PhantomWalletAdapter and SolflareWalletAdapter since they're now Standard Wallets
  TorusWalletAdapter 
} from '@solana/wallet-adapter-wallets'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { clusterApiUrl } from '@solana/web3.js'

// Import the required wallet adapter CSS
import '@solana/wallet-adapter-react-ui/styles.css'

interface WalletContextProviderProps {
  children: ReactNode
}

export const WalletContextProvider: FC<WalletContextProviderProps> = ({ children }) => {
  // Get network from environment variable
  const networkString = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'mainnet-beta';
  const network = networkString === 'devnet' 
    ? WalletAdapterNetwork.Devnet 
    : networkString === 'testnet'
      ? WalletAdapterNetwork.Testnet
      : WalletAdapterNetwork.Mainnet;
  
  // Get RPC URL from environment variable or fallback to public endpoint
  // Include network dependency since clusterApiUrl actually uses it
  const endpoint = useMemo(() => 
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl(network), 
    [network] // Include network dependency
  );
  
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
    }
  }, [network, endpoint])
  
  // Only include non-Standard Wallet adapters
  // Phantom and Solflare are now Standard Wallets and will be auto-detected
  const wallets = useMemo(
    () => [
      // Remove PhantomWalletAdapter and SolflareWalletAdapter
      // They're now automatically detected as Standard Wallets
      new TorusWalletAdapter()
    ],
    [] // Remove network dependency since TorusWalletAdapter doesn't need it
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider 
        wallets={wallets} 
        autoConnect
        onError={(error) => {
          // Handle wallet connection errors more gracefully
          console.warn('Wallet connection error:', error.message);
          // Don't throw the error, just log it
        }}
      >
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}