import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Connection, PublicKey } from '@solana/web3.js';
import DLMM from '@meteora-ag/dlmm';
import { secureLog } from '@/lib/utils/secureLogger';

// Define the Position type based on Prisma schema
interface Position {
  id: string;
  poolAddress: string;
  positionId: string;
  zbtcAmount: {
    toString(): string;
  };
  solAmount: {
    toString(): string;
  };
  entryPrice: {
    toString(): string;
  };
  pnlUsd: {
    toString(): string;
  } | null;
  pnlPercent: {
    toString(): string;
  } | null;
  createdAt: Date;
  isActive: boolean;
}

// Fetch token price from Jupiter
async function getTokenPrice(mint: string): Promise<number> {
  try {
    const res = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${mint}`);
    const data = await res.json();
    return data[0]?.usdPrice || 0;
  } catch {
    return 0;
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const publicKey = searchParams.get('publicKey');

    if (!publicKey) {
      secureLog.warn('[PnL API] Missing publicKey parameter');
      return NextResponse.json({ error: 'Public key required' }, { status: 400 });
    }

    secureLog.publicInfo('[PnL API] Fetching wallet data for publicKey:', publicKey);

    const wallet = await prisma.wallets.findUnique({
      where: { publicKey },
      include: {
        users: {
          include: {
            user_stats: true,
            positions: {
              where: { isActive: true },
              orderBy: { createdAt: 'desc' },
              select: {
                id: true,
                poolAddress: true,
                positionId: true,
                zbtcAmount: true,
                solAmount: true,
                entryPrice: true,
                pnlUsd: true,
                pnlPercent: true,
                createdAt: true,
                isActive: true
              }
            }
          }
        }
      }
    });

    if (!wallet) {
      secureLog.publicInfo('[PnL API] No wallet found in database for publicKey:', publicKey);
      return NextResponse.json({
        totalPnlUsd: '0',
        totalPositions: 0,
        activePositions: 0,
        positions: []
      });
    }

    secureLog.log('[PnL API] Wallet found, userId:', wallet.userId);

    const dbPositions = wallet.users.positions as Position[];

    // Fetch actual positions from Meteora
    const connection = new Connection(
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
    );

    const userPositions = await DLMM.getAllLbPairPositionsByUser(
      connection,
      new PublicKey(publicKey)
    );

    let totalPnlUsd = 0;
    const positionsWithPnL = [];

    for (const dbPos of dbPositions) {
      try {
        // Find matching Meteora position
        const positionInfo = userPositions.get(dbPos.poolAddress);
        if (!positionInfo) {
          secureLog.log('[PnL API] Position not found in Meteora:', dbPos.poolAddress);
          continue;
        }

        interface PoolData {
          tokenX?: { decimals: number };
          tokenY?: { decimals: number };
          tokenXMint?: { toBase58?: () => string } | string;
          tokenYMint?: { toBase58?: () => string } | string;
        }

        const pool = positionInfo.lbPair as PoolData;
        const meteoraPos = positionInfo.lbPairPositionsData.find(
          (p) => p.publicKey.toString() === dbPos.positionId
        );

        if (!meteoraPos) {
          secureLog.log('[PnL API] Meteora position not found for:', dbPos.positionId);
          continue;
        }

        // Get token decimals
        const xDecimals = pool.tokenX?.decimals || 9;
        const yDecimals = pool.tokenY?.decimals || 9;

        // Calculate current balances
        const xBalance = meteoraPos.positionData.totalXAmount
          ? Number(meteoraPos.positionData.totalXAmount) / Math.pow(10, xDecimals)
          : 0;
        const yBalance = meteoraPos.positionData.totalYAmount
          ? Number(meteoraPos.positionData.totalYAmount) / Math.pow(10, yDecimals)
          : 0;

        // Get fees
        const xFee = meteoraPos.positionData.feeX
          ? Number(meteoraPos.positionData.feeX) / Math.pow(10, xDecimals)
          : 0;
        const yFee = meteoraPos.positionData.feeY
          ? Number(meteoraPos.positionData.feeY) / Math.pow(10, yDecimals)
          : 0;

        // Get token prices
        const xMint = typeof pool.tokenXMint === 'string'
          ? pool.tokenXMint
          : (pool.tokenXMint as unknown as { toBase58?: () => string })?.toBase58?.() || '';
        const yMint = typeof pool.tokenYMint === 'string'
          ? pool.tokenYMint
          : (pool.tokenYMint as unknown as { toBase58?: () => string })?.toBase58?.() || '';

        const [xPrice, yPrice] = await Promise.all([
          getTokenPrice(xMint),
          getTokenPrice(yMint)
        ]);

        // Calculate current value (balances + fees)
        const currentValue =
          (xBalance + xFee) * xPrice +
          (yBalance + yFee) * yPrice;

        // Calculate entry value
        const entryZbtc = parseFloat(dbPos.zbtcAmount.toString());
        const entrySol = parseFloat(dbPos.solAmount.toString());
        const entryValue = entryZbtc * xPrice + entrySol * yPrice;

        // Calculate P&L
        const pnlUsd = currentValue - entryValue;
        const pnlPercent = entryValue > 0 ? (pnlUsd / entryValue) * 100 : 0;

        totalPnlUsd += pnlUsd;

        positionsWithPnL.push({
          id: dbPos.id,
          poolAddress: dbPos.poolAddress,
          zbtcAmount: dbPos.zbtcAmount.toString(),
          entryPrice: dbPos.entryPrice.toString(),
          pnlUsd: pnlUsd.toFixed(2),
          pnlPercent: pnlPercent.toFixed(2),
          createdAt: dbPos.createdAt.toISOString(),
          currentValue: currentValue.toFixed(2),
          entryValue: entryValue.toFixed(2)
        });
      } catch (error) {
        secureLog.error('[PnL API] Error processing position:', dbPos.id, error);
      }
    }

    const activePositions = positionsWithPnL.length;
    const stats = wallet.users.user_stats;
    const totalPositions = stats?.totalPositions || activePositions;

    secureLog.log('[PnL API] Calculated stats:', {
      totalPnlUsd: totalPnlUsd.toFixed(2),
      totalPositions,
      activePositions,
      positionsCount: positionsWithPnL.length
    });

    return NextResponse.json({
      totalPnlUsd: totalPnlUsd.toFixed(2),
      totalPositions,
      activePositions,
      avgPositionSize: stats?.avgPositionSize?.toString() || '0',
      positions: positionsWithPnL
    });
  } catch (error) {
    secureLog.error('[PnL API] Error fetching PnL data:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}