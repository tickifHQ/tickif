import { apiUrl, webUrl } from '../lib/environment';
import { randomUUID } from 'node:crypto';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { billingChangePreviewSchema, type PlanTier } from '@repo/contracts';
import { db, eq, schema } from '@repo/db';
import {
  createBillingOwner,
  deliverSubscriptionEvent,
  providerMutationCount,
} from '../lib/billing';

async function dismissProviderCheckout(page: Page) {
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

async function rejectPrematurePurchase(context: BrowserContext, targetTier: PlanTier) {
  const response = await context.request.post(`${apiUrl}/api/billing/change-preview`, {
    headers: { origin: webUrl },
    data: { targetTier },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const preview = billingChangePreviewSchema.parse(await response.json());
  expect(['current', 'recover']).toContain(preview.action);
  const purchase = await context.request.post(`${apiUrl}/api/billing/subscribe`, {
    headers: { origin: webUrl },
    data: { targetTier, previewToken: preview.previewToken, operationId: randomUUID() },
  });
  expect(purchase.status()).toBe(409);
  expect(await purchase.json()).toMatchObject({ error: { code: 'billing_action_unavailable' } });
}

for (const scenario of [
  {
    initialTier: 'professional_plus',
    initialLabel: 'Professional+',
    targetTier: 'corporate',
    targetLabel: 'Corporate',
    initialPlanId: 'plan_e2e_professional',
    targetPlanId: 'plan_e2e_corporate',
  },
  {
    initialTier: 'corporate',
    initialLabel: 'Corporate',
    targetTier: 'professional_plus',
    targetLabel: 'Professional+',
    initialPlanId: 'plan_e2e_corporate',
    targetPlanId: 'plan_e2e_professional',
  },
] as const) {
  for (const flow of ['Hobby cancellation', 'paid-plan recovery'] as const) {
    test(`Hobby purchase to ${scenario.initialLabel} preserves the paid cycle through ${flow}, repeat purchase attempts, and ${scenario.targetLabel} recovery`, async ({
      page,
      context,
    }) => {
      test.setTimeout(150_000);
      const owner = await createBillingOwner(context);
      await dismissProviderCheckout(page);
      const createsBefore = await providerMutationCount(context, '/subscriptions');
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      try {
        // Start genuinely on Hobby and go through the app's reviewed checkout route.
        // Only the provider boundary is synthetic; no paid subscription is seeded.
        expect(await owner.subscription()).toBeUndefined();
        await page.goto('/designer/plan-billing');
        await page
          .getByRole('region', { name: 'Choose your plan', exact: true })
          .getByRole('button', { name: `Upgrade to ${scenario.initialLabel}`, exact: true })
          .click();
        await page.getByRole('button', { name: 'Continue to payment', exact: true }).click();
        await expect(
          page.getByRole('button', { name: `Retry ${scenario.initialLabel}`, exact: true }),
        ).toBeVisible();
        const checkout = await owner.subscription();
        expect(checkout?.planTier).toBe('hobby');
        expect(checkout?.razorpayStatus).toBe('created');
        expect(checkout?.razorpaySubscriptionId).toBeTruthy();
        expect(await providerMutationCount(context, '/subscriptions')).toBe(createsBefore + 1);
        const sourceId = checkout!.razorpaySubscriptionId!;
        const cycleEnd = Math.floor(Date.now() / 1000) + 29 * 86400;
        const activeSource = {
          id: sourceId,
          entity: 'subscription',
          plan_id: scenario.initialPlanId,
          status: 'active',
          current_start: cycleEnd - 30 * 86400,
          current_end: cycleEnd,
          created_at: cycleEnd - 30 * 86400,
          notes: { organizationId: owner.org.id, tier: scenario.initialTier },
        };
        await deliverSubscriptionEvent(context, 'subscription.activated', activeSource);
        await expect
          .poll(async () => (await owner.subscription())?.planTier)
          .toBe(scenario.initialTier);
        await expect(
          page.getByRole('heading', { name: 'Plan activated', exact: true }),
        ).toBeVisible({ timeout: 15_000 });
        await page.getByRole('button', { name: 'Done', exact: true }).click();
        await expect(
          page.getByRole('button', {
            name: `${scenario.initialLabel} is your current plan`,
            exact: true,
          }),
        ).toBeVisible();

        // Exercise cancellation and paid-target recovery independently for each paid source.
        // Each accepted recovery must preserve the same original billing-cycle end.
        const targetAction =
          scenario.initialTier === 'corporate'
            ? 'Downgrade to Professional+'
            : 'Upgrade to Corporate';
        if (flow === 'paid-plan recovery') {
          await page
            .getByRole('region', { name: 'Choose your plan', exact: true })
            .getByRole('button', { name: targetAction, exact: true })
            .click();
          await page.getByRole('button', { name: 'Cancel & save plan', exact: true }).click();
          await expect(
            page.getByRole('heading', { name: 'Plan saved', exact: true }),
          ).toBeVisible();
        } else {
          await page.getByRole('button', { name: 'Switch to Hobby', exact: true }).click();
          await page.getByRole('button', { name: 'Schedule cancellation', exact: true }).click();
          await expect(
            page.getByRole('heading', { name: 'Plan change scheduled', exact: true }),
          ).toBeVisible();
          await page.getByRole('button', { name: 'Done', exact: true }).click();
          await page
            .getByRole('region', { name: 'Choose your plan', exact: true })
            .getByRole('button', { name: targetAction, exact: true })
            .click();
          await page.getByRole('button', { name: 'Save plan', exact: true }).click();
          await expect(
            page.getByRole('heading', { name: 'Plan saved', exact: true }),
          ).toBeVisible();
        }
        await page.getByRole('button', { name: 'Done', exact: true }).click();
        const scheduled = await owner.subscription();
        expect(scheduled).toMatchObject({
          planTier: scenario.initialTier,
          razorpaySubscriptionId: sourceId,
          cancelAtPeriodEnd: true,
        });
        expect(scheduled?.currentPeriodEnd?.getTime()).toBe(cycleEnd * 1000);
        expect(await providerMutationCount(context, `/subscriptions/${sourceId}/cancel`)).toBe(1);

        // Both the original paid plan and the other plan are protected against a
        // same-cycle replacement, even when a caller directly invokes /subscribe.
        await rejectPrematurePurchase(context, scenario.initialTier);
        await rejectPrematurePurchase(context, scenario.targetTier);
        expect(await providerMutationCount(context, '/subscriptions')).toBe(createsBefore + 1);
        expect(await providerMutationCount(context, `/subscriptions/${sourceId}/cancel`)).toBe(1);
        expect((await owner.subscription())?.currentPeriodEnd?.getTime()).toBe(cycleEnd * 1000);
        expect((await owner.subscription())?.planTier).toBe(scenario.initialTier);

        await page.reload();
        await expect(
          page.getByRole('button', {
            name: `${scenario.initialLabel} is your current plan`,
            exact: true,
          }),
        ).toBeDisabled();
        await expect(page.getByRole('button', { name: 'Review plan', exact: true })).toBeVisible();
        const [saved] = await db
          .select()
          .from(schema.billingRecovery)
          .where(eq(schema.billingRecovery.organizationId, owner.org.id));
        expect(saved).toMatchObject({
          targetTier: scenario.targetTier,
          sourceSubscriptionId: sourceId,
          status: 'waiting_for_expiry',
        });
        expect(saved?.eligibleAt?.getTime()).toBe(cycleEnd * 1000);
        await page.getByRole('button', { name: 'Review plan', exact: true }).click();
        await page.getByRole('button', { name: 'Save plan', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Plan saved', exact: true })).toBeVisible();
        expect(await providerMutationCount(context, `/subscriptions/${sourceId}/cancel`)).toBe(1);
        expect(await providerMutationCount(context, '/subscriptions')).toBe(createsBefore + 1);

        // Advancing the provider to an authoritative terminal state (not merely a
        // browser date) permits one fresh checkout, with a separate confirmation.
        const expiredAt = Math.floor(Date.now() / 1000) - 1;
        await deliverSubscriptionEvent(context, 'subscription.cancelled', {
          ...activeSource,
          status: 'cancelled',
          current_end: expiredAt,
          ended_at: expiredAt,
          cancel_at_cycle_end: true,
        });
        await expect.poll(async () => (await owner.subscription())?.planTier).toBe('hobby');
        // The mounted dialog detects expiry; checkout still requires explicit consent.
        await expect(
          page.getByRole('button', { name: `Review ${scenario.targetLabel}`, exact: true }),
        ).toBeVisible({ timeout: 45_000 });
        expect(await providerMutationCount(context, '/subscriptions')).toBe(createsBefore + 1);
        expect(await providerMutationCount(context, `/subscriptions/${sourceId}/cancel`)).toBe(1);
        await page
          .getByRole('button', { name: `Review ${scenario.targetLabel}`, exact: true })
          .click();
        await page.getByRole('button', { name: 'Continue to payment', exact: true }).click();
        await expect(
          page.getByRole('button', { name: `Retry ${scenario.targetLabel}`, exact: true }),
        ).toBeVisible();
        const replacement = await owner.subscription();
        expect(replacement?.planTier).toBe('hobby');
        expect(replacement?.razorpaySubscriptionId).not.toBe(sourceId);
        expect(await providerMutationCount(context, '/subscriptions')).toBe(createsBefore + 2);
        const replacementId = replacement!.razorpaySubscriptionId!;
        await deliverSubscriptionEvent(context, 'subscription.activated', {
          ...activeSource,
          id: replacementId,
          plan_id: scenario.targetPlanId,
          notes: { organizationId: owner.org.id, tier: scenario.targetTier },
        });
        await expect
          .poll(async () => (await owner.subscription())?.planTier)
          .toBe(scenario.targetTier);
        await expect(
          page.getByRole('heading', { name: 'Plan activated', exact: true }),
        ).toBeVisible({ timeout: 15_000 });
        await page.getByRole('button', { name: 'Done', exact: true }).click();
        await expect(
          page.getByRole('button', {
            name: `${scenario.targetLabel} is your current plan`,
            exact: true,
          }),
        ).toBeVisible();
        await expect
          .poll(async () => {
            const [intent] = await db
              .select()
              .from(schema.billingRecovery)
              .where(eq(schema.billingRecovery.organizationId, owner.org.id));
            return intent?.status;
          })
          .toBe('completed');

        // A later delivery concerning the old subscription must not overwrite the
        // replacement's tier, cancellation flag, or provider identity.
        await deliverSubscriptionEvent(context, 'subscription.updated', {
          ...activeSource,
          status: 'active',
          cancel_at_cycle_end: false,
        });
        expect(await owner.subscription()).toMatchObject({
          planTier: scenario.targetTier,
          razorpaySubscriptionId: replacementId,
          cancelAtPeriodEnd: false,
        });
        await expect(
          page.getByRole('button', {
            name: `${scenario.targetLabel} is your current plan`,
            exact: true,
          }),
        ).toBeVisible();
        expect(await providerMutationCount(context, `/subscriptions/${sourceId}/cancel`)).toBe(1);
        expect(await providerMutationCount(context, '/subscriptions')).toBe(createsBefore + 2);
        expect(errors).toEqual([]);
      } finally {
        await owner.dispose();
      }
    });
  }
}
