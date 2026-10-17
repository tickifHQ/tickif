import { createHmac } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { db, eq, schema } from '@repo/db';
import { createBillingOwner, providerMutationCount } from '../lib/billing';
import { providerUrl } from '../lib/environment';

test('authenticated future mandate supports payment update, dismissal and inline failure without changing paid access', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120_000);
  const owner = await createBillingOwner(context, 'corporate');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const remote = {
      ...owner.provider,
      status: 'authenticated',
      start_at: owner.provider.current_end,
      current_start: null,
      current_end: null,
    };
    expect(
      (
        await context.request.post(`${providerUrl}/billing-fixture/subscriptions`, { data: remote })
      ).ok(),
    ).toBeTruthy();
    await db
      .update(schema.subscription)
      .set({ razorpayStatus: 'authenticated' })
      .where(eq(schema.subscription.organizationId, owner.org.id));
    const before = await owner.subscription();
    const createsBefore = await providerMutationCount(context, '/subscriptions');
    await page.exposeBinding(
      'paymentMethodFixture',
      async (_source, id: string, change: boolean) => {
        expect(id).toBe(before?.razorpaySubscriptionId);
        expect(change).toBe(true);
        const paymentId = 'pay_mandate_update_fixture';
        return {
          razorpay_subscription_id: id,
          razorpay_payment_id: paymentId,
          razorpay_signature: createHmac('sha256', 'tickif-e2e-secret')
            .update(`${paymentId}|${id}`)
            .digest('hex'),
        };
      },
    );
    await page.addInitScript(() => {
      let opens = 0;
      class MandateCheckoutFixture {
        constructor(
          private options: {
            subscription_id: string;
            subscription_card_change: boolean;
            modal: { ondismiss: () => void };
            handler: (payment: Record<string, string>) => void;
          },
        ) {}
        on() {}
        async open() {
          const bridge = window as typeof window & {
            paymentMethodFixture: (id: string, change: boolean) => Promise<Record<string, string>>;
          };
          const payment = await bridge.paymentMethodFixture(
            this.options.subscription_id,
            this.options.subscription_card_change,
          );
          if (opens++ === 0) this.options.modal.ondismiss();
          else this.options.handler(payment);
        }
      }
      Object.assign(window, { Razorpay: MandateCheckoutFixture });
    });
    await page.goto('/designer/plan-billing');
    const summary = page
      .locator('[data-slot="card"]')
      .filter({ has: page.getByRole('heading', { name: 'Billing Summary', exact: true }) });
    await summary.getByRole('button', { name: 'Update Payment Method', exact: true }).click();
    await expect(summary.getByRole('status')).toContainText(
      'No payment method update was confirmed',
    );
    const failMethod = '**/api/billing/payment-method';
    await page.route(failMethod, (route) =>
      route.fulfill({
        status: 409,
        json: {
          error: {
            code: 'conflict',
            message: 'Payment update is temporarily unavailable. Please try again.',
          },
        },
      }),
    );
    await summary.getByRole('button', { name: 'Update Payment Method', exact: true }).click();
    await expect(summary.getByRole('status')).toContainText(
      'Payment update is temporarily unavailable',
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await summary.getByRole('status').scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('payment-method-inline-mobile.png') });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBeTruthy();
    await page.unroute(failMethod);
    await summary.getByRole('button', { name: 'Update Payment Method', exact: true }).click();
    await expect(summary.getByRole('status')).toContainText('Payment method verified');
    await expect(
      summary.getByRole('button', { name: 'Update Payment Method', exact: true }),
    ).toBeEnabled();
    const after = await owner.subscription();
    expect(after).toMatchObject({
      planTier: 'corporate',
      subscriptionState: 'active',
      razorpayStatus: 'authenticated',
      razorpaySubscriptionId: before?.razorpaySubscriptionId,
      currentPeriodEnd: before?.currentPeriodEnd,
    });
    expect(await providerMutationCount(context, '/subscriptions')).toBe(createsBefore);
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.getByRole('button', { name: 'Switch context', exact: true })).toContainText(
      'Corporate',
    );
    await summary.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('payment-method-success-desktop.png') });
    expect(errors).toEqual([]);
  } finally {
    await owner.dispose();
  }
});
