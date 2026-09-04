import Redis from 'ioredis';
import { config } from '@repo/config';

/**
 * Worker-side invalidation of the API's E-119 entitlement display cache.
 *
 * The API caches `GET /api/billing/subscription` under `cache:entitlements:<orgId>`
 * (ioredis keyPrefix `cache:` + key `entitlements:<orgId>`) with a 5-min TTL.
 * Authorization never reads this cache (all gates read the plan fresh from the DB
 * via findOrganizationPlan), so this is a display-freshness fix, not a security one.
 *
 * Uses a dedicated ioredis client — per project convention the cache client is
 * NEVER shared with the BullMQ connection. Graceful: any failure is a no-op and
 * the cache self-heals on its TTL.
 */

let client: Redis | null = null;
let connectionFailed = false;

function getClient(): Redis | null {
  if (connectionFailed) return null;
  if (client) return client;
  try {
    client = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: 3000,
      keyPrefix: 'cache:', // matches apps/api/src/lib/redis.ts
    });
    client.on('error', () => {
      connectionFailed = true;
      client?.disconnect();
      client = null;
    });
    void client.connect().catch(() => {
      connectionFailed = true;
      client = null;
    });
    return client;
  } catch {
    return null;
  }
}

/** Invalidate the entitlement display cache for an organization. No-op on failure. */
export async function invalidateEntitlementCache(organizationId: string): Promise<void> {
  const redis = getClient();
  if (!redis) return;
  try {
    await redis.del(`entitlements:${organizationId}`);
  } catch {
    // Non-fatal — the cache expires on its own TTL.
  }
}

/** Close the cache client on worker shutdown. */
export async function closeEntitlementCache(): Promise<void> {
  if (client) {
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
    client = null;
  }
}
