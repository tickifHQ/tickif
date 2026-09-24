import '../lib/environment';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { billingMutationRequestSchema, type PlanTier } from '@repo/contracts';
import { db, eq, schema } from '@repo/db';
import {
  createBillingOwner,
  deliverSubscriptionEvent,
  providerMutationCount,
} from '../lib/billing';

const tiers = [
  { tier: 'hobby', label: 'Hobby' },
  { tier: 'professional_plus', label: 'Professional+' },
  { tier: 'corporate', label: 'Corporate' },
] as const;
const entryPoints = [
  { path: '/designer/plan-billing', label: 'overview' },
  { path: '/designer/plan-billing/subscribe', label: 'subscribe' },
] as const;

type BillingOwner = Awaited<ReturnType<typeof createBillingOwner>>;

async function installCheckoutDismissal(page: Page) {
  await page.addInitScript(() => {
    class CheckoutFixture {
      constructor(private options: { modal: { ondismiss: () => void } }) {}
      on() {}
      open() {
        this.options.modal.ondismiss();
      }
    }
    Object.assign(window, { Razorpay: CheckoutFixture });
  });
}

async function confirmProviderActivation(
  context: BrowserContext,
  owner: BillingOwner,
  target: Exclude<PlanTier, 'hobby'>,
) {
  const pending = await owner.subscription();
  expect(pending?.planTier).toBe('hobby');
  expect(pending?.razorpayStatus).toBe('created');
  const now = Math.floor(Date.now() / 1000);
  await deliverSubscriptionEvent(context, 'subscription.activated', {
    id: pending!.razorpaySubscriptionId,
    entity: 'subscription',
    plan_id: target === 'corporate' ? 'plan_e2e_corporate' : 'plan_e2e_professional',
    status: 'active',
    current_start: now,
    current_end: now + 30 * 86400,
    created_at: now,
    notes: { organizationId: owner.org.id, tier: target },
  });
  await expect.poll(async () => (await owner.subscription())?.planTier).toBe(target);
  return pending!.razorpaySubscriptionId;
}

/** All provider transitions below are controlled fixture evidence, not merchant capability proof. */
for (const entry of entryPoints) {
  for (const current of tiers) {
    for (const target of tiers) {
      const sameTier = current.tier === target.tier;
      const semantics = sameTier
        ? 'no-op'
        : current.tier === 'hobby'
          ? 'checkout activation'
          : target.tier === 'hobby'
            ? 'cycle-end cancellation'
            : 'explicit deferred recovery';
      test(`${entry.label}: ${current.label} -> ${target.label}: ${semantics}`, async ({
        page,
        context,
      }) => {
        test.setTimeout(120_000);
        const owner = await createBillingOwner(context, current.tier);
        const mutations: Array<{ path: string; targetTier: PlanTier }> = [];
        const runtimeErrors: string[] = [];
        page.on('pageerror', (error) => runtimeErrors.push(error.message));
        page.on('request', (request) => {
          const path = new URL(request.url()).pathname;
          if (
            request.method() !== 'POST' ||
            !/^\/api\/billing\/(subscribe|change-plan|cancel|recovery)$/.test(path)
          )
            return;
          const parsed = billingMutationRequestSchema.parse(request.postDataJSON());
          mutations.push({ path, targetTier: parsed.targetTier });
        });
        await installCheckoutDismissal(page);
        try {
          await page.goto(entry.path);
          await expect(
            page.getByRole('button', {
              name: `${current.label} is your current plan`,
              exact: true,
            }),
          ).toBeDisabled();
          await expect(
            page.getByText('Checking available billing actions…', { exact: true }),
          ).toHaveCount(0);

          if (sameTier) {
            // A current-plan marker is an inert state, never another purchase or cancellation.
            await expect(page.getByRole('dialog')).not.toBeVisible();
            await page.reload();
            await expect(
              page.getByRole('button', {
                name: `${current.label} is your current plan`,
                exact: true,
              }),
            ).toBeDisabled();
            expect(mutations).toEqual([]);
            expect((await owner.subscription())?.planTier ?? 'hobby').toBe(current.tier);
            expect(
              await providerMutationCount(context, `/subscriptions/${owner.provider.id}`),
            ).toBe(0);
            expect(
              await providerMutationCount(context, `/subscriptions/${owner.provider.id}/cancel`),
            ).toBe(0);
            expect(
              await db
                .select()
                .from(schema.billingOperation)
                .where(eq(schema.billingOperation.organizationId, owner.org.id)),
            ).toEqual([]);
            expect(runtimeErrors).toEqual([]);
            return;
          }

          const label =
            target.tier === 'hobby'
              ? 'Switch to Hobby'
              : `${current.tier === 'corporate' ? 'Downgrade' : 'Upgrade'} to ${target.label}`;
          await page
            .getByRole('region', { name: 'Choose your plan', exact: true })
            .getByRole('button', { name: label, exact: true })
            .click();
          await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible();

          if (current.tier === 'hobby') {
            await page.getByRole('button', { name: 'Continue to payment', exact: true }).click();
            await expect(
              page.getByRole('button', { name: 'Continue checkout', exact: true }),
            ).toBeVisible();
            expect(mutations).toEqual([
              { path: '/api/billing/subscribe', targetTier: target.tier },
            ]);
            if (target.tier === 'hobby')
              throw new Error('Same-tier branch should already have returned');
            await confirmProviderActivation(context, owner, target.tier);
          } else {
            const recovery = target.tier !== 'hobby';
            const cta = recovery ? 'Cancel & save plan' : 'Schedule cancellation';
            if (recovery) {
              await expect(
                page.getByRole('button', { name: 'Confirm plan change', exact: true }),
              ).not.toBeVisible();
              await expect(
                page.getByText(/No replacement subscription is purchased now/),
              ).toBeVisible();
            }
            await page.getByRole('button', { name: cta, exact: true }).click();
            await expect(
              page.getByRole('heading', {
                name: recovery ? 'Plan saved' : 'Plan change scheduled',
                exact: true,
              }),
            ).toBeVisible();
            expect(mutations).toEqual([
              {
                path: recovery ? '/api/billing/recovery' : '/api/billing/cancel',
                targetTier: target.tier,
              },
            ]);
            const scheduled = await owner.subscription();
            expect(scheduled?.planTier).toBe(current.tier);
            expect(scheduled?.cancelAtPeriodEnd).toBe(true);
            expect(scheduled?.razorpaySubscriptionId).toBe(owner.provider.id);
            expect(
              await providerMutationCount(context, `/subscriptions/${owner.provider.id}/cancel`),
            ).toBe(1);
            expect(
              await providerMutationCount(context, `/subscriptions/${owner.provider.id}`),
            ).toBe(0);
            if (recovery) {
              const [intent] = await db
                .select()
                .from(schema.billingRecovery)
                .where(eq(schema.billingRecovery.organizationId, owner.org.id));
              expect(intent).toMatchObject({
                targetTier: target.tier,
                status: 'waiting_for_expiry',
                sourceSubscriptionId: owner.provider.id,
              });
            }
            // No access change or replacement occurs merely because cancellation was accepted.
            await page.reload();
            await expect(
              page
                .getByRole('region', { name: 'Choose your plan', exact: true })
                .locator('[data-slot="card"]')
                .filter({ has: page.getByRole('heading', { name: current.label, exact: true }) })
                .getByRole('button', {
                  name: `${current.label} is your current plan`,
                  exact: true,
                }),
            ).toBeDisabled();
            expect(mutations).toHaveLength(1);
            const now = Math.floor(Date.now() / 1000);
            await deliverSubscriptionEvent(context, 'subscription.cancelled', {
              ...owner.provider,
              entity: 'subscription',
              status: 'cancelled',
              current_end: now - 1,
              ended_at: now,
              cancel_at_cycle_end: true,
            });
            await expect.poll(async () => (await owner.subscription())?.planTier).toBe('hobby');
            await expect(
              page.getByRole('button', { name: 'Hobby is your current plan', exact: true }),
            ).toBeVisible({ timeout: 45_000 });
            expect(mutations).toHaveLength(1);
            if (recovery) {
              await page
                .getByRole('button', { name: `Review ${target.label}`, exact: true })
                .click();
              expect(mutations).toHaveLength(1);
              await page.getByRole('button', { name: 'Continue to payment', exact: true }).click();
              await expect(
                page.getByRole('button', { name: 'Continue checkout', exact: true }),
              ).toBeVisible();
              expect(mutations[1]).toEqual({
                path: '/api/billing/subscribe',
                targetTier: target.tier,
              });
              const replacementId = await confirmProviderActivation(context, owner, target.tier);
              expect(replacementId).not.toBe(owner.provider.id);
            }
          }
          if (target.tier !== 'hobby') {
            await expect(
              page.getByRole('heading', { name: 'Plan activated', exact: true }),
            ).toBeVisible({ timeout: 15_000 });
            expect(mutations).toHaveLength(current.tier === 'hobby' ? 1 : 2);
            await page.getByRole('button', { name: 'Done', exact: true }).click();
          }
          await expect(
            page.getByRole('button', { name: `${target.label} is your current plan`, exact: true }),
          ).toBeVisible();
          expect(runtimeErrors).toEqual([]);
        } finally {
          await owner.dispose();
        }
      });
    }
  }
}
