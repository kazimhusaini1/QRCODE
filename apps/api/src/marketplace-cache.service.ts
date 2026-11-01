import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class MarketplaceCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(MarketplaceCacheService.name);
  private readonly redis?: Redis;
  constructor() {
    const url = process.env.REDIS_URL;
    if (url) this.redis = new Redis(url, { lazyConnect: true, connectTimeout: 1500, maxRetriesPerRequest: 1, retryStrategy: () => null, enableOfflineQueue: false });
  }

  async remember<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
    if (!this.redis) return load();
    let cacheKey: string | undefined;
    try {
      const version = await this.redis.get('mahalla:marketplace:version') ?? '1';
      cacheKey = `mahalla:marketplace:v${version}:${key}`;
      const cached = await this.redis.get(cacheKey);
      if (cached !== null) return JSON.parse(cached) as T;
    } catch (error) { this.logger.warn(`Marketplace cache read bypassed: ${error instanceof Error ? error.message : 'Redis unavailable'}`); }
    const value = await load();
    if (cacheKey) try { await this.redis.set(cacheKey, JSON.stringify(value), 'EX', ttlSeconds); }
    catch (error) { this.logger.warn(`Marketplace cache write bypassed: ${error instanceof Error ? error.message : 'Redis unavailable'}`); }
    return value;
  }

  async invalidateMarketplace() {
    if (!this.redis) return;
    try { await this.redis.incr('mahalla:marketplace:version'); }
    catch (error) { this.logger.warn(`Marketplace cache invalidation bypassed: ${error instanceof Error ? error.message : 'Redis unavailable'}`); }
  }

  async health(): Promise<'ready' | 'disabled' | 'unavailable'> {
    if (!this.redis) return 'disabled';
    try { return await this.redis.ping() === 'PONG' ? 'ready' : 'unavailable'; }
    catch { return 'unavailable'; }
  }

  async onModuleDestroy() { if (this.redis && this.redis.status !== 'end') await this.redis.quit().catch(() => undefined); }
}
