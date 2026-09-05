import Redis from 'ioredis';
import { config } from '@repo/config';

/**
 * Shared Redis client for API-layer caching (E-119 entitlements).
 *
 * Separate from BullMQ's internal connection — never share this instance
 * with BullMQ queues/workers (per project convention in docs/troubleshooting.md).
 *
 * Lazy-initialized: the client connects on first use, not at import time.
 * Graceful degradation: if Redis is unavailable, cache operations are no-ops
 * and the service falls through to the database.
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
      // Dedicated namespace to avoid collision with BullMQ keys
      keyPrefix: 'cache:',
    });

    client.on('error', (err) => {
      console.error('[redis-cache] connection error:', err.message);
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
    connectionFailed = false;
    return null;
  }
}

/** Cache TTL in seconds for entitlement data. */
const ENTITLEMENT_TTL = 300; // 5 minutes

/**
 * Get a cached entitlement value. Returns null on miss or Redis unavailable.
 */
export async function getCachedEntitlement(organizationId: string): Promise<string | null> {
  const redis = getClient();
  if (!redis) return null;
  try {
    return await redis.get(`entitlements:${organizationId}`);
  } catch {
    return null;
  }
}

/**
 * Set a cached entitlement value with the standard TTL.
 */
export async function setCachedEntitlement(
  organizationId: string,
  value: string,
): Promise<void> {
  const redis = getClient();
  if (!redis) return;
  try {
    await redis.set(`entitlements:${organizationId}`, value, 'EX', ENTITLEMENT_TTL);
  } catch {
    // Cache write failure is non-fatal
  }
}

/**
 * Invalidate cached entitlements for an organization.
 * Called by the webhook handler when subscription state/tier changes.
 */
export async function invalidateEntitlementCache(organizationId: string): Promise<void> {
  const redis = getClient();
  if (!redis) return;
  try {
    await redis.del(`entitlements:${organizationId}`);
  } catch {
    // Cache invalidation failure is non-fatal
  }
}

/**
 * Acquire a short lease before polling the billing provider for an organization.
 * Redis outages fail open so reconciliation remains available; the database row
 * lock still serializes provider-backed mutations in that degraded mode.
 */
export async function acquireBillingRefreshLease(
  organizationId: string,
  ttlSeconds = 30,
): Promise<boolean> {
  const redis = getClient();
  if (!redis) return true;
  try {
    return (
      (await redis.set(`billing-refresh:${organizationId}`, '1', 'EX', ttlSeconds, 'NX')) === 'OK'
    );
  } catch {
    return true;
  }
}

/**
 * Close the Redis connection gracefully (for shutdown).
 */
export async function closeRedisCache(): Promise<void> {
  if (client) {
    await client.quit().catch(() => {});
    client = null;
  }
}
