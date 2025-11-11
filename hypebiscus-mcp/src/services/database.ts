// Database service - Prisma client wrapper with connection management
import { PrismaClient } from '@prisma/client';
import { logger } from '../config.js';

/**
 * Singleton Prisma client instance
 * Ensures single database connection pool throughout application lifecycle
 */
class DatabaseService {
  private static instance: PrismaClient | null = null;
  private static isConnected = false;

  /**
   * Gets or creates the Prisma client instance
   * @returns PrismaClient instance
   */
  static getClient(): PrismaClient {
    if (!this.instance) {
      logger.info('Initializing Prisma client');

      this.instance = new PrismaClient({
        log: [], // Disable all logging to prevent stdout/stderr pollution in MCP stdio mode
        errorFormat: 'minimal',
      });

      logger.info('Prisma client initialized');
    }

    return this.instance;
  }

  /**
   * Connects to the database with retry logic
   * @returns Promise<void>
   */
  static async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        const client = this.getClient();
        await client.$connect();

        // Verify connection with a test query
        await client.$queryRaw`SELECT 1`;

        this.isConnected = true;
        logger.info('Database connection established');
        return;
      } catch (error) {
        retryCount++;
        logger.error(`Database connection attempt ${retryCount}/${maxRetries} failed:`, error);

        if (retryCount === maxRetries) {
          logger.error('Database connection failed after multiple retries');
          throw new Error('Database connection failed');
        }

        // Exponential backoff: 1s, 2s, 4s
        const backoffMs = 1000 * Math.pow(2, retryCount - 1);
        logger.info(`Retrying in ${backoffMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }

  /**
   * Disconnects from the database
   * @returns Promise<void>
   */
  static async disconnect(): Promise<void> {
    if (!this.instance || !this.isConnected) {
      return;
    }

    try {
      await this.instance.$disconnect();
      this.isConnected = false;
      logger.info('Database connection closed');
    } catch (error) {
      logger.error('Error disconnecting from database:', error);
    }
  }

  /**
   * Checks if database is connected
   * @returns boolean
   */
  static async isHealthy(): Promise<boolean> {
    try {
      const client = this.getClient();
      await client.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      logger.error('Database health check failed:', error);
      return false;
    }
  }
}

/**
 * Export singleton Prisma client instance
 */
export const prisma = DatabaseService.getClient();

/**
 * Export database utility functions
 */
export const database = {
  connect: () => DatabaseService.connect(),
  disconnect: () => DatabaseService.disconnect(),
  isHealthy: () => DatabaseService.isHealthy(),
  getClient: () => DatabaseService.getClient(),
};

/**
 * Database query utilities
 */
export const dbUtils = {
  /**
   * Finds user by wallet public key
   * @param publicKey - Solana wallet public key
   * @returns User with wallet and stats, or null
   */
  async findUserByWallet(publicKey: string) {
    return prisma.users.findFirst({
      where: {
        wallets: {
          publicKey,
        },
      },
      include: {
        wallets: {
          select: {
            id: true,
            publicKey: true,
            createdAt: true,
            // Exclude encrypted private key and IV for security
          },
        },
        user_stats: true,
      },
    });
  },

  /**
   * Finds positions for a user
   * @param userId - User ID
   * @param includeInactive - Include closed positions
   * @returns Array of positions
   */
  async findPositionsByUserId(userId: string, includeInactive = false) {
    return prisma.positions.findMany({
      where: {
        userId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: [
        { isActive: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  },

  /**
   * Finds a specific position by on-chain position ID
   * @param positionId - On-chain position ID
   * @returns Position or null
   */
  async findPositionById(positionId: string) {
    return prisma.positions.findUnique({
      where: {
        positionId,
      },
      include: {
        users: {
          include: {
            wallets: {
              select: {
                publicKey: true,
              },
            },
          },
        },
      },
    });
  },

  /**
   * Counts active positions for a user in a specific pool
   * @param userId - User ID
   * @param poolAddress - Pool address
   * @returns Count of active positions
   */
  async countActivePositionsInPool(userId: string, poolAddress: string) {
    return prisma.positions.count({
      where: {
        userId,
        poolAddress,
        isActive: true,
      },
    });
  },

  /**
   * Gets aggregated statistics for a user
   * @param userId - User ID
   * @returns Aggregated stats
   */
  async getUserAggregatedStats(userId: string) {
    const [stats, positions] = await Promise.all([
      prisma.user_stats.findUnique({
        where: { userId },
      }),
      prisma.positions.findMany({
        where: { userId },
        select: {
          pnlUsd: true,
          pnlPercent: true,
          isActive: true,
        },
      }),
    ]);

    // Calculate best and worst positions
    const closedPositions = positions.filter((p) => !p.isActive && p.pnlUsd !== null);
    let bestPosition = null;
    let worstPosition = null;

    if (closedPositions.length > 0) {
      bestPosition = closedPositions.reduce((best, current) =>
        (current.pnlUsd ?? 0) > (best.pnlUsd ?? 0) ? current : best
      );
      worstPosition = closedPositions.reduce((worst, current) =>
        (current.pnlUsd ?? 0) < (worst.pnlUsd ?? 0) ? current : worst
      );
    }

    return {
      stats,
      bestPositionPnl: bestPosition?.pnlUsd?.toNumber() ?? null,
      worstPositionPnl: worstPosition?.pnlUsd?.toNumber() ?? null,
      totalClosedPositions: closedPositions.length,
    };
  },
};
