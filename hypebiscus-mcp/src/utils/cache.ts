// Simple in-memory cache with TTL
import { logger } from '../config.js';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export class MemoryCache {
  private cache: Map<string, CacheEntry<unknown>>;

  constructor() {
    this.cache = new Map();
  }

  /**
   * Sets a value in the cache with TTL
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttl - Time to live in milliseconds
   */
  set<T>(key: string, value: T, ttl: number): void {
    try {
      const entry: CacheEntry<T> = {
        data: value,
        timestamp: Date.now(),
        ttl,
      };
      this.cache.set(key, entry as CacheEntry<unknown>);
      logger.debug(`Cache SET: ${key} (TTL: ${ttl}ms)`);
    } catch (error) {
      logger.warn(`Failed to cache key ${key}:`, error);
    }
  }

  /**
   * Gets a value from the cache if not expired
   * @param key - Cache key
   * @returns Cached value or null if expired/missing
   */
  get<T>(key: string): T | null {
    try {
      const entry = this.cache.get(key) as CacheEntry<T> | undefined;

      if (!entry) {
        logger.debug(`Cache MISS: ${key}`);
        return null;
      }

      const age = Date.now() - entry.timestamp;

      if (age > entry.ttl) {
        logger.debug(`Cache EXPIRED: ${key} (age: ${age}ms, ttl: ${entry.ttl}ms)`);
        this.cache.delete(key);
        return null;
      }

      logger.debug(`Cache HIT: ${key} (age: ${age}ms)`);
      return entry.data;
    } catch (error) {
      logger.warn(`Failed to retrieve cache key ${key}:`, error);
      return null;
    }
  }

  /**
   * Clears a specific key from the cache
   * @param key - Cache key to clear
   */
  delete(key: string): void {
    this.cache.delete(key);
    logger.debug(`Cache DELETE: ${key}`);
  }

  /**
   * Clears all cache entries
   */
  clear(): void {
    this.cache.clear();
    logger.info('Cache cleared');
  }

  /**
   * Gets the current cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Removes all expired entries
   */
  cleanup(): void {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      logger.debug(`Cache cleanup: removed ${removed} expired entries`);
    }
  }
}

// Global cache instance
export const cache = new MemoryCache();

// Run cleanup every 5 minutes
setInterval(() => {
  cache.cleanup();
}, 5 * 60 * 1000);

/**
 * Higher-order function that wraps an async function with caching
 * @param key - Cache key
 * @param fn - Async function to execute if cache miss
 * @param ttlSeconds - Time to live in seconds
 * @returns Result from cache or function execution
 */
export async function withCache<T>(
  key: string,
  fn: () => Promise<T>,
  ttlSeconds: number = 60
): Promise<T> {
  // Try to get from cache first
  const cached = cache.get<T>(key);
  if (cached !== null) {
    return cached;
  }

  // Cache miss - execute function
  const result = await fn();

  // Store in cache
  cache.set(key, result, ttlSeconds * 1000);

  return result;
}
