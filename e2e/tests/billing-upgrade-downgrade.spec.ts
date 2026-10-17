import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { billingChangePreviewSchema } from '@repo/contracts';
import { db, eq, schema } from '@repo/db';
import { apiUrl, webUrl } from '../lib/environment';
import {
  createBillingOwner,
  completeReplacement,
  providerMutationCount,
  deliverSubscriptionEvent,
} from '../lib/billing';

test('confirmed upgrade can schedule a downgrade without checkout warnings or losing paid access', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120_000);
  const owner = await createBillingOwner(context, 'professional_plus');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
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
  try {
    const headers = { origin: webUrl };
    const response = await context.request.post(`${apiUrl}/api/billing/change-preview`, {
      headers,
      data: { targetTier: 'corporate' },
    });
    const quote = billingChangePreviewSchema.parse(await response.json());
    expect(
      (
        await context.request.post(`${apiUrl}/api/billing/change-plan`, {
          headers,
          data: {
            targetTier: 'corporate',
            previewToken: quote.previewToken,
            operationId: randomUUID(),
          },
        })
      ).ok(),
    ).toBeTruthy();
    const paidUpgrade = await completeReplacement(context, owner);
    expect((await owner.subscription())?.planTier).toBe('corporate');
    await page.goto('/designer/plan-billing/subscribe');
    await expect(page.getByText('Plan confirmed', { exact: true })).toBeVisible();
    const plans = page.getByRole('region', { name: 'Choose your plan', exact: true });
    await plans.getByRole('button', { name: 'Downgrade to Professional+', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toContainText('Resume its checkout');
    await page.getByRole('button', { name: 'Confirm plan change', exact: true }).click();
    await page.getByRole('button', { name: 'Continue plan change', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Checkout closed', exact: true })).toBeVisible();
    const creates = await providerMutationCount(context, '/subscriptions');
    expect((await owner.subscription())?.razorpaySubscriptionId).toBe(
      paidUpgrade.replacementSubscriptionId,
    );
    expect(
      await providerMutationCount(
        context,
        `/subscriptions/${paidUpgrade.replacementSubscriptionId}/cancel`,
      ),
    ).toBe(0);
    await page.getByRole('link', { name: 'Choose your plan', exact: true }).click();
    await plans.getByRole('button', { name: 'Downgrade to Professional+', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm plan change', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Continue plan change', exact: true }),
    ).toBeVisible();
    expect(await providerMutationCount(context, '/subscriptions')).toBe(creates);
    const [next] = await db
      .select()
      .from(schema.billingReplacement)
      .where(eq(schema.billingReplacement.supersedesId, paidUpgrade.id));
    expect(next?.amount).toBe(0);
    expect(next?.periodEnd.getTime()).toBe(paidUpgrade.periodEnd.getTime());
    await deliverSubscriptionEvent(context, 'subscription.updated', {
      id: next!.replacementSubscriptionId,
      plan_id: next!.targetPlanId,
      status: 'authenticated',
      start_at: Math.floor(next!.periodEnd.getTime() / 1000),
      current_start: null,
      current_end: null,
    });
    await page.getByRole('button', { name: 'Check status', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Plan change scheduled', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.reload();
    await expect(page.getByText('Plan change scheduled', { exact: true })).toBeVisible();
    await expect(page.getByText(/Resume its checkout|Confirming payment/)).toHaveCount(0);
    expect(await owner.subscription()).toMatchObject({
      planTier: 'corporate',
      subscriptionState: 'active',
      currentPeriodEnd: paidUpgrade.periodEnd,
    });
    expect(
      await providerMutationCount(
        context,
        `/subscriptions/${paidUpgrade.replacementSubscriptionId}/cancel`,
      ),
    ).toBe(1);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('downgrade-scheduled-mobile.png') });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/designer/plan-billing');
    await expect(page.getByRole('link', { name: 'Team & Roles', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Plan & Billing', exact: true })).toBeVisible();
    await expect(page.getByText('Plan change scheduled', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('downgrade-paid-access-desktop.png') });
    expect(errors).toEqual([]);
  } finally {
    await owner.dispose();
  }
});
