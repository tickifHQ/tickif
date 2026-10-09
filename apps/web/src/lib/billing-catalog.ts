import { billingCatalogResponseSchema, type BillingCatalogResponse } from '@repo/contracts';
import { api } from '@/lib/api';
import { getServerLogger } from '@/lib/logger.server';

export async function getBillingCatalog(): Promise<BillingCatalogResponse | null> {
  try {
    const response = await api.api.billing.plans.$get(undefined, { init: { cache: 'no-store' } });
    if (!response.ok) throw new Error('Plan catalogue unavailable');
    const parsed = billingCatalogResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error('Invalid plan catalogue');
    return parsed.data;
  } catch (error) {
    getServerLogger().error(
      { event: 'web.billing_catalog.failed', error },
      'Plan catalogue fetch failed',
    );
    return null;
  }
}
