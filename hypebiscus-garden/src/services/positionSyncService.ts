// src/services/positionSyncService.ts
import { DlmmService } from './dlmmService';
import { prisma } from './db';

export class PositionSyncService {
  constructor(private dlmmService: DlmmService) {}

  /**
   * Sync a single position - check if closed on-chain and update DB
   */
  async syncPosition(positionId: string): Promise<void> {
    try {
      // Get position from database
      const dbPosition = await prisma.position.findUnique({
        where: { positionId }
      });

      if (!dbPosition || !dbPosition.isActive) {
        return; // Already closed or doesn't exist
      }

      // Check on-chain status
      let onChainPosition;
      try {
        onChainPosition = await this.dlmmService.getPositionDetails(positionId);
      } catch (error: any) {
        // Position not found on-chain = closed
        if (error.message?.includes('not found')) {
          onChainPosition = null;
        } else {
          throw error; // Re-throw unexpected errors
        }
      }
      
      if (!onChainPosition) {
        // Position doesn't exist on-chain anymore = closed
        console.log(`📊 Position ${positionId} closed on-chain, updating DB...`);
        
        // Get current pool price
        const poolStatus = await this.dlmmService.getPoolStatus();
        
        // For closed positions, we need to estimate returns
        // In reality, you'd want to track this when closing via monitoring
        // For now, estimate based on entry amounts
        const zbtcAmount = Number(dbPosition.zbtcAmount);
        const solAmount = Number(dbPosition.solAmount);
        
        // Estimate returned amounts (simplified - actual would come from close transaction)
        const zbtcReturned = zbtcAmount;
        const solReturned = solAmount;
        
        // Calculate PnL
        const entryValueUsd = zbtcAmount * Number(dbPosition.entryPrice);
        const exitValueUsd = (zbtcReturned * poolStatus.currentPrice) + solReturned;
        const pnlUsd = exitValueUsd - entryValueUsd;
        const pnlPercent = (pnlUsd / entryValueUsd) * 100;

        // Update database
        await prisma.position.update({
          where: { positionId },
          data: {
            isActive: false,
            exitPrice: poolStatus.currentPrice,
            exitBin: poolStatus.activeBinId,
            zbtcReturned,
            solReturned,
            pnlUsd,
            pnlPercent,
            closedAt: new Date()
          }
        });

        console.log(`✅ Position ${positionId} synced: ${pnlPercent.toFixed(2)}% PnL ($${pnlUsd.toFixed(2)})`);
      }
    } catch (error) {
      console.error(`❌ Failed to sync position ${positionId}:`, error);
    }
  }

  /**
   * Sync all active positions for a user
   */
  async syncUserPositions(userId: string): Promise<void> {
    try {
      const activePositions = await prisma.position.findMany({
        where: { userId, isActive: true }
      });

      console.log(`🔄 Syncing ${activePositions.length} positions for user ${userId}...`);

      for (const position of activePositions) {
        await this.syncPosition(position.positionId);
      }

      console.log(`✅ Sync complete for user ${userId}`);
    } catch (error) {
      console.error(`❌ Failed to sync user positions:`, error);
    }
  }

  /**
   * Sync all active positions in the system
   */
  async syncAllPositions(): Promise<void> {
    try {
      const activePositions = await prisma.position.findMany({
        where: { isActive: true }
      });

      console.log(`🔄 Syncing ${activePositions.length} total active positions...`);

      for (const position of activePositions) {
        await this.syncPosition(position.positionId);
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log(`✅ All positions synced`);
    } catch (error) {
      console.error(`❌ Failed to sync all positions:`, error);
    }
  }
}