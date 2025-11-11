import DLMM from '@meteora-ag/dlmm';
import { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { StrategyType } from '@meteora-ag/dlmm';
import { PoolStatus } from '../types';

const BUFFER_BINS = 10;
const REPOSITION_COOLDOWN_MS = 300000;
const MAX_CREATE_RETRIES = 3;
const RETRY_DELAY_MS = 3000;

export class DlmmService {
  private connection: Connection;
  private pool: DLMM | null = null;
  private lastRepositionTime = new Map<string, number>();

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl, 'confirmed');
  }

  async initializePool(): Promise<void> {
    if (this.pool) return;

    try {
      const poolAddress = process.env.ZBTC_SOL_POOL_ADDRESS;
      
      if (!poolAddress || poolAddress.trim() === '') {
        throw new Error('ZBTC_SOL_POOL_ADDRESS not configured in .env file');
      }
      
      console.log(`🔍 Connecting to pool: ${poolAddress}`);
      const poolPubkey = new PublicKey(poolAddress);
      
      this.pool = await DLMM.create(this.connection, poolPubkey);
      console.log('✅ DLMM Pool connected successfully');
      
      const activeBin = await this.pool.getActiveBin();
      console.log(`📊 Active Bin ID: ${activeBin.binId}`);
      console.log(`💰 Active Bin Price: ${activeBin.price}`);
    } catch (error) {
      console.error('❌ Failed to connect to pool:', error);
      throw error;
    }
  }

  async getPoolStatus(): Promise<PoolStatus> {
    await this.initializePool();
    if (!this.pool) throw new Error('Pool not initialized');

    const activeBin = await this.pool.getActiveBin();
    
    return {
      currentPrice: parseFloat(activeBin.price),
      activeBinId: activeBin.binId,
      priceChange24h: 0,
      totalLiquidity: activeBin.xAmount.toString()
    };
  }

  async isPositionOutOfRange(
    positionId: string,
    bufferBins: number = BUFFER_BINS
  ): Promise<boolean> {
    await this.initializePool();
    if (!this.pool) throw new Error('Pool not initialized');

    try {
      const positionPubkey = new PublicKey(positionId);
      const position = await this.pool.getPosition(positionPubkey);
      const activeBin = await this.pool.getActiveBin();
      
      if (!position || !position.positionData) {
        console.log(`⚠️ Position not found: ${positionId}`);
        return true;
      }

      const positionBins = position.positionData.positionBinData || [];
      if (positionBins.length === 0) {
        console.log(`⚠️ Position has no bins: ${positionId}`);
        return true;
      }

      const minBinId = Math.min(...positionBins.map((bin: any) => bin.binId));
      const maxBinId = Math.max(...positionBins.map((bin: any) => bin.binId));
      
      const effectiveMinBin = minBinId - bufferBins;
      const effectiveMaxBin = maxBinId + bufferBins;
      
      const isOutOfRange = 
        activeBin.binId < effectiveMinBin ||
        activeBin.binId > effectiveMaxBin;
      
      let distanceFromPosition = 0;
      if (activeBin.binId < minBinId) {
        distanceFromPosition = minBinId - activeBin.binId;
      } else if (activeBin.binId > maxBinId) {
        distanceFromPosition = activeBin.binId - maxBinId;
      }
      
      if (isOutOfRange) {
        console.log(`⚠️ Position SIGNIFICANTLY out of range:`);
        console.log(`   Position ID: ${positionId.substring(0, 8)}...`);
        console.log(`   Active Bin: ${activeBin.binId}`);
        console.log(`   Position Range: ${minBinId} - ${maxBinId}`);
        console.log(`   Buffer Zone: ${effectiveMinBin} - ${effectiveMaxBin}`);
        console.log(`   Distance: ${distanceFromPosition} bins from edge`);
      } else if (distanceFromPosition > 0) {
        console.log(`📊 Position near edge but within buffer:`);
        console.log(`   Active Bin: ${activeBin.binId}`);
        console.log(`   Position Range: ${minBinId} - ${maxBinId}`);
        console.log(`   Distance: ${distanceFromPosition} bins from edge`);
        console.log(`   Buffer remaining: ${bufferBins - distanceFromPosition} bins`);
      }
      
      return isOutOfRange;
    } catch (error) {
      console.error('❌ Failed to check position range:', error);
      return false;
    }
  }

  canReposition(positionId: string): boolean {
    const lastTime = this.lastRepositionTime.get(positionId);
    if (!lastTime) return true;
    
    const timeSince = Date.now() - lastTime;
    const canReposition = timeSince >= REPOSITION_COOLDOWN_MS;
    
    if (!canReposition) {
      const remainingSeconds = Math.round((REPOSITION_COOLDOWN_MS - timeSince) / 1000);
      console.log(`⏳ Reposition cooldown: ${remainingSeconds}s remaining`);
    }
    
    return canReposition;
  }

  private recordReposition(positionId: string): void {
    this.lastRepositionTime.set(positionId, Date.now());
  }

  async createPositionWithTracking(
    userKeypair: Keypair,
    zbtcAmount: number
  ): Promise<{
    positionId: string;
    entryPrice: number;
    entryBin: number;
  }> {
    await this.initializePool();
    if (!this.pool) throw new Error('Pool not initialized');

    const activeBin = await this.pool.getActiveBin();
    const entryBin = activeBin.binId;
    const entryPrice = parseFloat(activeBin.price);

    console.log(`📊 Entry: Bin ${entryBin}, Price $${entryPrice.toFixed(2)}`);

    const positionId = await this.createPosition(
      userKeypair,
      zbtcAmount
    );

    return {
      positionId,
      entryPrice,
      entryBin
    };
  }

  async createPosition(
    userKeypair: Keypair,
    zbtcAmount: number,
    maxRetries: number = 5
  ): Promise<string> {
    await this.initializePool();
    if (!this.pool) throw new Error('Pool not initialized');

    let lastError: any;
    let lastActiveBinId: number | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🎯 Creating position (attempt ${attempt}/${maxRetries})...`);
        
        const activeBin = await this.pool.getActiveBin();
        console.log(`📊 Active Bin: ${activeBin.binId} at price ${activeBin.price}`);
        
        if (lastActiveBinId !== null && Math.abs(activeBin.binId - lastActiveBinId) > 2) {
          console.log(`⚠️ Bin moving rapidly: ${lastActiveBinId} → ${activeBin.binId}`);
          console.log(`💤 Waiting 3s for market stabilization...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
          lastActiveBinId = activeBin.binId;
          continue;
        }
        lastActiveBinId = activeBin.binId;
        
        const positionKeypair = Keypair.generate();
        
        const minBinId = activeBin.binId;
        const maxBinId = activeBin.binId + 68;
        
        const totalXAmount = new BN(zbtcAmount * Math.pow(10, 8));
        const totalYAmount = new BN(0);
        
        console.log(`🎯 Full range position:`);
        console.log(`   Min bin: ${minBinId} (current price)`);
        console.log(`   Max bin: ${maxBinId}`);
        console.log(`   Total bins: ${maxBinId - minBinId + 1}`);
        
        const { blockhash, lastValidBlockHeight } = 
          await this.connection.getLatestBlockhash('confirmed');
        console.log(`🔗 Fresh blockhash: ${blockhash.substring(0, 8)}...`);
        
        const createPositionTx = await this.pool.initializePositionAndAddLiquidityByStrategy({
          positionPubKey: positionKeypair.publicKey,
          user: userKeypair.publicKey,
          totalXAmount,
          totalYAmount,
          strategy: {
            maxBinId,
            minBinId,
            strategyType: StrategyType.BidAsk
          },
          slippage: 1000
        });

        createPositionTx.recentBlockhash = blockhash;
        createPositionTx.feePayer = userKeypair.publicKey;
        createPositionTx.sign(userKeypair, positionKeypair);
        
        const rawTransaction = createPositionTx.serialize();
        
        console.log(`📤 Sending transaction...`);
        
        const signature = await this.sendAndConfirmWithRetry(
          rawTransaction,
          blockhash,
          lastValidBlockHeight,
          attempt
        );

        console.log(`✅ Position created: ${positionKeypair.publicKey.toString()}`);
        console.log(`📊 Range: ${maxBinId - minBinId + 1} bins (${minBinId}-${maxBinId})`);
        console.log(`🛡️ Buffer zone: ±${BUFFER_BINS} bins`);
        console.log(`📝 Tx: ${signature}`);
        
        return positionKeypair.publicKey.toString();
        
      } catch (error: any) {
        lastError = error;
        const errorMessage = error?.message || String(error);
        const errorLogs = error?.transactionLogs?.join('\n') || '';
        
        const isSlippageError = 
          errorMessage.toLowerCase().includes('slippage') ||
          errorMessage.toLowerCase().includes('price moved') ||
          errorLogs.includes('ExceededBinSlippageTolerance') ||
          errorLogs.includes('6004');
        
        const isBlockHeightError = 
          errorMessage.includes('block height exceeded') ||
          errorMessage.includes('BlockheightExceeded');
        
        if (isSlippageError || isBlockHeightError) {
          console.log(`⚠️ Attempt ${attempt} failed: ${
            isSlippageError ? 'Slippage' : 'Block height'
          } error`);
          
          if (attempt < maxRetries) {
            const delay = attempt <= 3 ? attempt * 1000 : attempt * 1500;
            console.log(`💤 Waiting ${delay/1000}s before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
        
        console.error('❌ Failed to create position:', error);
        throw error;
      }
    }
    
    throw new Error(
      `Failed after ${maxRetries} attempts. Market too volatile.`
    );
  }

  private async sendAndConfirmWithRetry(
    rawTransaction: Buffer,
    blockhash: string,
    lastValidBlockHeight: number,
    attemptNumber: number
  ): Promise<string> {
    const TX_RETRY_INTERVAL = 2000;
    let txSendAttempts = 0;
    
    const signature = await this.connection.sendRawTransaction(rawTransaction, {
      skipPreflight: false,
      maxRetries: 0,
      preflightCommitment: 'confirmed'
    });
    
    console.log(`📝 Transaction sent: ${signature}`);
    
    const confirmPromise = this.connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      'confirmed'
    );
    
    let confirmed = false;
    
    while (!confirmed) {
      try {
        const result = await Promise.race([
          confirmPromise,
          new Promise<null>(resolve => setTimeout(() => resolve(null), TX_RETRY_INTERVAL))
        ]);
        
        if (result) {
          confirmed = true;
          console.log(`✅ Confirmed after ${txSendAttempts} resends`);
          break;
        }
        
        const currentBlockHeight = await this.connection.getBlockHeight('confirmed');
        if (currentBlockHeight > lastValidBlockHeight) {
          throw new Error('Transaction expired: block height exceeded');
        }
        
        txSendAttempts++;
        console.log(`🔄 Not confirmed, resending (${txSendAttempts})...`);
        
        await this.connection.sendRawTransaction(rawTransaction, {
          skipPreflight: true,
          maxRetries: 0
        });
        
      } catch (error: any) {
        if (error.message?.includes('block height exceeded')) {
          throw error;
        }
        console.error('Error during confirmation:', error);
        throw error;
      }
    }
    
    return signature;
  }

  async createMaxRangePosition(
    userKeypair: Keypair,
    zbtcAmount: number,
    maxRetries: number = 5
  ): Promise<string> {
    return this.createPosition(userKeypair, zbtcAmount, maxRetries);
  }

  async repositionLiquidityWithTracking(
    userKeypair: Keypair,
    oldPositionId: string,
    zbtcAmount: number,
    solAmount: number,
    useMaxRange: boolean = true
  ): Promise<{
    positionId: string;
    entryPrice: number;
    entryBin: number;
    exitPrice: number;
    exitBin: number;
  }> {
    try {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🔄 REPOSITIONING: ${oldPositionId.substring(0, 8)}...`);
      console.log(`${'='.repeat(60)}\n`);
      
      if (!this.canReposition(oldPositionId)) {
        const lastTime = this.lastRepositionTime.get(oldPositionId)!;
        const timeSince = Date.now() - lastTime;
        const remainingSeconds = Math.round((REPOSITION_COOLDOWN_MS - timeSince) / 1000);
        throw new Error(
          `Reposition on cooldown. Wait ${remainingSeconds}s.`
        );
      }
      
      await this.initializePool();
      if (!this.pool) throw new Error('Pool not initialized');
      
      const oldPositionPubkey = new PublicKey(oldPositionId);
      const oldPosition = await this.pool.getPosition(oldPositionPubkey);
      
      if (!oldPosition) {
        throw new Error('Old position not found or already closed');
      }
      
      console.log(`✅ Old position verified`);
      
      const exitBinData = await this.pool.getActiveBin();
      const exitPrice = parseFloat(exitBinData.price);
      const exitBin = exitBinData.binId;
      
      console.log(`📊 Exit: Bin ${exitBin}, Price $${exitPrice.toFixed(2)}`);
      
      console.log(`\n🔴 CLOSING OLD POSITION...`);
      await this.closePosition(userKeypair, oldPositionId);
      console.log(`✅ Old position closed`);
      
      console.log(`⏳ Waiting 2s for liquidity to return...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log(`\n🟢 CREATING NEW POSITION...`);
      const newPositionResult = await this.createPositionWithTracking(
        userKeypair,
        zbtcAmount
      );
      
      this.recordReposition(newPositionResult.positionId);
      
      console.log(`\n${'='.repeat(60)}`);
      console.log(`✅ REPOSITION COMPLETE`);
      console.log(`${'='.repeat(60)}`);
      console.log(`🔴 Old: ${oldPositionId.substring(0, 8)}...`);
      console.log(`🟢 New: ${newPositionResult.positionId.substring(0, 8)}...`);
      console.log(`📊 Exit: Bin ${exitBin}, Price $${exitPrice.toFixed(2)}`);
      console.log(`📊 Entry: Bin ${newPositionResult.entryBin}, Price $${newPositionResult.entryPrice.toFixed(2)}`);
      console.log(`${'='.repeat(60)}\n`);
      
      return {
        positionId: newPositionResult.positionId,
        entryPrice: newPositionResult.entryPrice,
        entryBin: newPositionResult.entryBin,
        exitPrice,
        exitBin
      };
      
    } catch (error: any) {
      console.error(`\n❌ REPOSITION FAILED:`, error.message);
      throw error;
    }
  }

  async closePosition(userKeypair: Keypair, positionId: string): Promise<void> {
    await this.initializePool();
    if (!this.pool) throw new Error('Pool not initialized');

    try {
      const positionPubkey = new PublicKey(positionId);
      const position = await this.pool.getPosition(positionPubkey);
      
      if (!position || !position.positionData) {
        console.log('⚠️ Position not found or already closed');
        return;
      }

      const binIdsToRemove = position.positionData.positionBinData.map(
        (bin: any) => bin.binId
      );

      if (binIdsToRemove.length === 0) {
        console.log('⚠️ Position has no bins');
        return;
      }

      const fromBinId = Math.min(...binIdsToRemove);
      const toBinId = Math.max(...binIdsToRemove);

      console.log(`📊 Removing liquidity from bins ${fromBinId} to ${toBinId}`);

      const removeLiquidityTx = await this.pool.removeLiquidity({
        position: positionPubkey,
        user: userKeypair.publicKey,
        fromBinId,
        toBinId,
        bps: new BN(100 * 100),
        shouldClaimAndClose: true
      });

      const txArray = Array.isArray(removeLiquidityTx) 
        ? removeLiquidityTx 
        : [removeLiquidityTx];

      for (const tx of txArray) {
        const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
        tx.recentBlockhash = blockhash;
        tx.feePayer = userKeypair.publicKey;
        tx.sign(userKeypair);
        
        const rawTx = tx.serialize();
        const signature = await this.connection.sendRawTransaction(rawTx, {
          skipPreflight: false,
          maxRetries: 2
        });
        
        console.log(`📝 Remove liquidity tx sent: ${signature}`);
        
        await this.connection.confirmTransaction(signature, 'confirmed');
        console.log(`✅ Liquidity removed and position closed`);
      }
      
    } catch (error) {
      console.error('❌ Failed to close position:', error);
      throw error;
    }
  }

  async getPositionDetails(positionId: string): Promise<any> {
    await this.initializePool();
    if (!this.pool) throw new Error('Pool not initialized');

    try {
      const positionPubkey = new PublicKey(positionId);
      const position = await this.pool.getPosition(positionPubkey);
      
      if (!position || !position.positionData) {
        return null;
      }

      const positionBins = position.positionData.positionBinData || [];
      const binCount = positionBins.length;
      const minBinId = Math.min(...positionBins.map((bin: any) => bin.binId));
      const maxBinId = Math.max(...positionBins.map((bin: any) => bin.binId));
      
      return {
        positionId,
        binCount,
        minBinId,
        maxBinId,
        range: maxBinId - minBinId,
        bins: positionBins
      };
    } catch (error) {
      console.error('❌ Failed to get position details:', error);
      return null;
    }
  }
}