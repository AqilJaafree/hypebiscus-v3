// src/components/LPStatusBadge.tsx
"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Connection } from "@solana/web3.js";
import DLMM from "@meteora-ag/dlmm";
import Link from "next/link";

const LPStatusBadge = () => {
  const { publicKey, connected } = useWallet();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!connected || !publicKey) {
      setCount(0);
      return;
    }

    const fetchPositions = async () => {
      try {
        const connection = new Connection(
          process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"
        );
        const positions = await DLMM.getAllLbPairPositionsByUser(connection, publicKey);
        setCount(positions.size);
      } catch (error) {
        console.error("Error fetching positions:", error);
      }
    };

    fetchPositions();
    const interval = setInterval(fetchPositions, 30000);
    return () => clearInterval(interval);
  }, [publicKey, connected]);

  if (!connected || count === 0) return null;

  return (
    <Link href="/wallet">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30 hover:bg-green-500/20 transition-all">
        <div className="relative">
          <div className="w-2 h-2 bg-green-500 rounded-full" />
          <div className="absolute inset-0 w-2 h-2 bg-green-500 rounded-full animate-ping" />
        </div>
        <span className="hidden sm:inline text-sm font-medium text-green-400">
          {count} Active {count === 1 ? "Position" : "Positions"}
        </span>
        <span className="sm:hidden text-sm font-medium text-green-400">{count}</span>
      </div>
    </Link>
  );
};

export default LPStatusBadge;