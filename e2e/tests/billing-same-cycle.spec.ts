import { apiUrl, webUrl } from '../lib/environment';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { billingChangePreviewSchema } from '@repo/contracts';
import {
  createBillingOwner,
  completeReplacement,
  providerMutationCount,
  deliverSubscriptionEvent,
} from '../lib/billing';

for (const scenario of [
  { source: 'professional_plus', target: 'corporate', label: 'Upgrade to Corporate' },
  { source: 'corporate', target: 'professional_plus', label: 'Downgrade to Professional+' },
] as const) {
  for (const cancelled of [false, true]) {
    test(`Hobby purchase then ${scenario.label} uses the original paid cycle with cancellation ${cancelled}`, async ({
      page,
      context,
    }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width: cancelled ? 390 : 1280, height: 900 });
      const owner = await createBillingOwner(context, 'hobby');
      const headers = { origin: webUrl };
      try {
        const initialLabel = scenario.source === 'corporate' ? 'Corporate' : 'Professional+';
        await page.goto('/designer/plan-billing');
        await page
          .getByRole('region', { name: 'Choose your plan', exact: true })
          .getByRole('button', { name: `Upgrade to ${initialLabel}`, exact: true })
          .click();
        await page.getByRole('button', { name: 'Continue to payment', exact: true }).click();
        await expect(
          page.getByRole('button', { name: 'Continue checkout', exact: true }),
        ).toBeVisible();
        const purchase = await owner.subscription();
        expect(purchase?.planTier).toBe('hobby');
        expect(purchase?.razorpaySubscriptionId).toBeTruthy();
        owner.provider.id = purchase!.razorpaySubscriptionId!;
        owner.provider.plan_id =
          scenario.source === 'corporate' ? 'plan_e2e_corporate' : 'plan_e2e_professional';
        owner.provider.notes.tier = scenario.source;
        await deliverSubscriptionEvent(context, 'subscription.activated', owner.provider);
        await expect.poll(async () => (await owner.subscription())?.planTier).toBe(scenario.source);
        await expect(
          page.getByRole('heading', { name: 'Plan activated', exact: true }),
        ).toBeVisible();
        await page.getByRole('button', { name: 'Done', exact: true }).click();
        if (cancelled) {
          const response = await context.request.post(`${apiUrl}/api/billing/change-preview`, {
            headers,
            data: { targetTier: 'hobby' },
          });
          const quote = billingChangePreviewSchema.parse(await response.json());
          expect(
            (
              await context.request.post(`${apiUrl}/api/billing/cancel`, {
                headers,
                data: {
                  targetTier: 'hobby',
                  previewToken: quote.previewToken,
                  operationId: randomUUID(),
                },
              })
            ).ok(),
          ).toBeTruthy();
        }
        const before = await providerMutationCount(context, '/subscriptions');
        await page.goto('/designer/plan-billing');
        await page
          .getByRole('region', { name: 'Choose your plan', exact: true })
          .getByRole('button', { name: scenario.label, exact: true })
          .click();
        await page.getByRole('button', { name: 'Confirm plan change', exact: true }).click();
        await expect(
          page.getByRole('button', { name: 'Continue plan change', exact: true }),
        ).toBeVisible();
        expect((await owner.subscription())?.planTier).toBe(scenario.source);
        await page.reload();
        await page
          .getByRole('region', { name: 'Choose your plan', exact: true })
          .getByRole('button', { name: scenario.label, exact: true })
          .click();
        await page.getByRole('button', { name: 'Confirm plan change', exact: true }).click();
        await expect(
          page.getByRole('button', { name: 'Continue plan change', exact: true }),
        ).toBeVisible();
        expect(await providerMutationCount(context, '/subscriptions')).toBe(before + 1);
        const replacement = await completeReplacement(context, owner);
        expect(replacement.periodEnd.getTime()).toBe(owner.provider.current_end * 1000);
        expect((await owner.subscription())?.planTier).toBe('corporate');
        await page.getByRole('button', { name: 'Check status', exact: true }).click();
        await expect(
          page.getByRole('heading', {
            name: scenario.target === 'corporate' ? 'Plan activated' : 'Plan change scheduled',
            exact: true,
          }),
        ).toBeVisible();
        expect(await providerMutationCount(context, `/subscriptions/${owner.provider.id}`)).toBe(0);
        expect(
          await providerMutationCount(context, `/subscriptions/${owner.provider.id}/cancel`),
        ).toBe(1);
      } finally {
        await owner.dispose();
      }
    });
  }
}
