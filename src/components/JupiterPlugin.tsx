// src/components/JupiterPlugin.tsx
"use client";

import React, { useState, useEffect } from "react";

interface JupiterPluginProps {
  className?: string;
  onClose?: () => void;
}

interface SwapParams {
  txid: string;
  swapResult: unknown;
  [key: string]: unknown;
}

interface ErrorParams {
  error?: unknown;
  quoteResponseMeta: unknown;
  [key: string]: unknown;
}

const JupiterPlugin: React.FC<JupiterPluginProps> = ({ 
  className = "", 
}) => {
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);

  // Ensure component is mounted before doing anything
  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;

    // Check if script is already loaded
    if (typeof window !== "undefined" && window.Jupiter) {
      setIsScriptLoaded(true);
      setIsLoading(false);
      return;
    }

    // Wait for the Jupiter script to load
    const checkJupiter = setInterval(() => {
      if (typeof window !== "undefined" && window.Jupiter) {
        setIsScriptLoaded(true);
        setIsLoading(false);
        clearInterval(checkJupiter);
      }
    }, 100);

    // Timeout after 10 seconds
    const timeout = setTimeout(() => {
      setIsLoading(false);
      clearInterval(checkJupiter);
    }, 10000);

    return () => {
      clearInterval(checkJupiter);
      clearTimeout(timeout);
    };
  }, [isMounted]);

  useEffect(() => {
    if (!isMounted || !isScriptLoaded) return;

    let jupiterInstance: unknown = null;

    if (window.Jupiter) {
      try {
        window.Jupiter.init({
          displayMode: "integrated",
          integratedTargetId: "jupiter-plugin",
          
          // Pre-configure the trade: SOL to zBTC using correct properties
          formProps: {
            initialInputMint: "So11111111111111111111111111111111111111112", // SOL mint address
            initialOutputMint: "zBTCug3er3tLyffELcvDNrKkCymbPWysGcWihESYfLg", // zBTC mint address
          },
          
          onSuccess: (params: SwapParams) => {
            console.log('Swap successful:', params.txid, params.swapResult);
            // You can add notifications here
          },
          
          onSwapError: (params: ErrorParams) => {
            console.error('Swap error:', params.error, params.quoteResponseMeta);
            // You can add error handling here
          },
          
          autoConnect: true,
          defaultExplorer: 'Solscan',
        });

        jupiterInstance = window.Jupiter;
      } catch (error) {
        console.error('Error initializing Jupiter Plugin:', error);
      }
    }
    
    return () => {
      if (jupiterInstance && typeof (jupiterInstance as { close?: () => void }).close === 'function') {
        try {
          (jupiterInstance as { close: () => void }).close();
        } catch (error) {
          console.error('Error closing Jupiter Plugin:', error);
        }
      }
    };
  }, [isMounted, isScriptLoaded]);

  // Don't render anything until mounted (prevents hydration mismatch)
  if (!isMounted) {
    return null;
  }

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center h-96 ${className}`}>
        <div className="animate-pulse text-gray-400">
          Loading Jupiter Plugin...
        </div>
      </div>
    );
  }

  if (!isScriptLoaded) {
    return (
      <div className={`flex items-center justify-center h-96 ${className}`}>
        <div className="text-red-400">
          Failed to load Jupiter Plugin
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <div id="jupiter-plugin" className="w-full" />
    </div>
  );
};

export default JupiterPlugin;