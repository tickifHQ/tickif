import { createHmac } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { billingReplacementCheckoutSchema, razorpayPaymentSchema } from '@repo/contracts';
import { apiUrl, providerUrl, webUrl } from '../lib/environment';
import {
  createBillingOwner,
  deliverSubscriptionEvent,
  providerMutationCount,
} from '../lib/billing';

for (const width of [1412, 390]) {
  test(`checkout close restores plan choices and another plan completes safely at ${width}px`, async ({
    page,
    context,
  }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 844 });
    const owner = await createBillingOwner(context);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const before = await providerMutationCount(context, '/subscriptions');
    const paymentId = `pay_test_${owner.org.id}`;
    await page.exposeBinding('confirmSyntheticPayment', async (_source, subscriptionId: string) => {
      expect(subscriptionId).toBe((await owner.subscription())?.razorpaySubscriptionId);
      const now = Math.floor(Date.now() / 1000);
      // Signed callback acknowledges authorization, but does not grant paid access.
      expect(
        (
          await context.request.post(`${providerUrl}/billing-fixture/subscriptions`, {
            data: {
              id: subscriptionId,
              plan_id: 'plan_e2e_corporate',
              status: 'authenticated',
              current_start: now,
              current_end: now + 30 * 86400,
              notes: { organizationId: owner.org.id, tier: 'corporate' },
            },
          })
        ).ok(),
      ).toBeTruthy();
      return {
        razorpay_subscription_id: subscriptionId,
        razorpay_payment_id: paymentId,
        razorpay_signature: createHmac('sha256', 'tickif-e2e-secret')
          .update(`${paymentId}|${subscriptionId}`)
          .digest('hex'),
      };
    });
    await page.addInitScript(() => {
      class SyntheticCheckout {
        constructor(
          private options: {
            subscription_id: string;
            modal: { ondismiss: () => void };
            handler: (payload: Record<string, string>) => void;
          },
        ) {}
        on() {}
        open() {
          setTimeout(() => {
            const overlay = document.createElement('div');
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-label', 'Razorpay test checkout');
            overlay.style.cssText =
              'position:fixed;inset:0;z-index:999999;display:grid;place-items:center;background:#0006;padding:24px';
            overlay.innerHTML =
              '<section style="width:100%;max-width:380px;background:white;border-radius:16px;padding:28px;font:14px system-ui;color:#18181b;box-shadow:0 24px 80px #0003"><p style="font-size:11px;letter-spacing:2px;color:#71717a">LOCAL PAYMENT SIMULATOR</p><h2 style="font-size:24px;margin:20px 0 8px">Razorpay checkout</h2><p style="color:#71717a;line-height:1.6">Test the checkout return flow.<br>No payment will be taken.</p><button type="button" style="width:100%;margin-top:24px;padding:12px;border:0;border-radius:8px;background:#18181b;color:white">Simulate successful payment</button><button type="button" style="width:100%;margin-top:12px;padding:12px;border:1px solid #e4e4e7;border-radius:8px;background:white">Close test checkout</button></section>';
            const buttons = overlay.querySelectorAll('button');
            buttons[1]!.onclick = () => {
              overlay.remove();
              this.options.modal.ondismiss();
            };
            buttons[0]!.onclick = async () => {
              buttons[0]!.disabled = true;
              const bridge = window as typeof window & {
                confirmSyntheticPayment: (id: string) => Promise<Record<string, string>>;
              };
              const payment = await bridge.confirmSyntheticPayment(this.options.subscription_id);
              overlay.remove();
              this.options.handler(payment);
            };
            document.body.appendChild(overlay);
          }, 3000);
        }
      }
      Object.assign(window, { Razorpay: SyntheticCheckout });
    });
    try {
      await page.goto('/designer/plan-billing');
      await page.getByRole('button', { name: 'Upgrade to Professional+', exact: true }).click();
      await expect(page).toHaveURL(/\/designer\/plan-billing\/subscribe(?:\?.*)?$/);
      const confirmation = page.getByRole('dialog', { name: 'Plan subscription', exact: true });
      await expect(confirmation).toBeVisible();
      await expect(
        confirmation.getByRole('region', { name: 'Choose your plan', exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Continue to payment', exact: true }),
      ).toBeVisible();
      await confirmation.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(confirmation).toHaveCount(0);
      await page.getByRole('link', { name: 'Back to billing', exact: true }).click();
      await expect(page).toHaveURL(`${webUrl}/designer/plan-billing`);
      await page.goBack();
      await expect(page).toHaveURL(`${webUrl}/designer/plan-billing/subscribe`);
      // Browser history can restore cached server props, but must not restore abandoned intent.
      await expect(confirmation).toHaveCount(0);
      await expect(page.getByText('Selected plan', { exact: true })).toHaveCount(0);
      for (const label of ['Upgrade to Professional+', 'Upgrade to Corporate'])
        await expect(page.getByRole('button', { name: label, exact: true })).toBeEnabled();
      await page.screenshot({
        path: testInfo.outputPath('00-pricing-page.png'),
        animations: 'disabled',
      });
      expect(await providerMutationCount(context, '/subscriptions')).toBe(before);
      await page.getByRole('button', { name: 'Upgrade to Professional+', exact: true }).click();
      await expect(confirmation).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('01-review.png'), animations: 'disabled' });
      await page.getByRole('button', { name: 'Continue to payment', exact: true }).click();
      await expect(page.getByRole('status', { name: 'Secure checkout' })).toBeVisible();
      await expect(page).toHaveURL(/\/designer\/plan-billing\/subscribe(?:\?.*)?$/);
      await page.screenshot({ path: testInfo.outputPath('02-loader.png') });
      await expect(page.getByRole('dialog', { name: 'Razorpay test checkout' })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('03-popup.png') });
      await page.getByRole('button', { name: 'Close test checkout', exact: true }).click();
      await expect(page).toHaveURL(/\/subscribe\/closed\?plan=professional_plus$/);
      await expect(
        page.getByRole('heading', { name: 'Checkout closed', exact: true }),
      ).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('04-closed.png') });
      const created = await owner.subscription();
      expect(created?.planTier).toBe('hobby');
      await page.getByRole('link', { name: 'Back to billing', exact: true }).first().click();
      await expect(page).toHaveURL(`${webUrl}/designer/plan-billing`);
      await expect(page.getByRole('status', { name: 'Billing status' })).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Continue checkout', exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Upgrade to Professional+', exact: true }),
      ).toBeEnabled();
      await page.screenshot({ path: testInfo.outputPath('00-billing-choices-restored.png') });
      await page.getByRole('link', { name: 'Manage Subscription', exact: true }).click();
      await expect(page).toHaveURL(`${webUrl}/designer/plan-billing/subscribe`);
      await page.reload();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByText('Selected plan', { exact: true })).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Upgrade to Corporate', exact: true }),
      ).toBeEnabled();
      await page.getByRole('button', { name: 'Upgrade to Corporate', exact: true }).click();
      await expect(confirmation).toBeVisible();
      // Reviewing a different plan never creates a provider checkout until confirmed.
      expect(await providerMutationCount(context, '/subscriptions')).toBe(before + 1);
      await page.getByRole('button', { name: 'Continue to payment', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Razorpay test checkout' })).toBeVisible();
      const replacement = await owner.subscription();
      expect(replacement?.razorpaySubscriptionId).not.toBe(created?.razorpaySubscriptionId);
      expect(await providerMutationCount(context, '/subscriptions')).toBe(before + 2);
      await deliverSubscriptionEvent(context, 'subscription.activated', {
        ...owner.provider,
        id: created!.razorpaySubscriptionId,
        status: 'active',
        plan_id: 'plan_e2e_professional',
        notes: { organizationId: owner.org.id, tier: 'professional_plus' },
      });
      expect(await owner.subscription()).toMatchObject({
        planTier: 'hobby',
        razorpaySubscriptionId: replacement!.razorpaySubscriptionId,
      });
      expect(
        await providerMutationCount(
          context,
          `/subscriptions/${created!.razorpaySubscriptionId}/cancel`,
        ),
      ).toBe(1);
      await page.getByRole('button', { name: 'Simulate successful payment', exact: true }).click();
      await expect(page).toHaveURL(/\/subscribe\/complete\?plan=corporate$/);
      await expect(page.getByText('Confirming your payment', { exact: true })).toBeVisible();
      expect((await owner.subscription())?.planTier).toBe('hobby');
      await page.screenshot({ path: testInfo.outputPath('05-receipt-processing.png') });
      const now = Math.floor(Date.now() / 1000);
      const activeSubscription = {
        id: replacement!.razorpaySubscriptionId,
        entity: 'subscription',
        status: 'active',
        plan_id: 'plan_e2e_corporate',
        current_start: now,
        current_end: now + 30 * 86400,
        created_at: now,
        notes: { organizationId: owner.org.id, tier: 'corporate' },
      };
      await deliverSubscriptionEvent(context, 'subscription.activated', activeSubscription);
      // An active plan alone prints nothing; the receipt waits for the captured charge.
      await expect(page.getByText('Confirming your payment', { exact: true })).toBeVisible();
      await deliverSubscriptionEvent(context, 'subscription.charged', activeSubscription, {
        id: paymentId,
        entity: 'payment',
        amount: 799900,
        currency: 'INR',
        status: 'captured',
        created_at: now,
      });
      await expect(page.getByText('Printing your receipt', { exact: true })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('06-receipt-printing.png') });
      const receipt = page.getByRole('article', { name: 'Receipt', exact: true });
      await expect(page.getByText('Payment confirmed', { exact: true })).toBeVisible();
      await expect(receipt).toContainText('Corporate plan');
      await expect(receipt).toContainText('₹7,999.00');
      await expect(receipt).toContainText(paymentId);
      await page.screenshot({ path: testInfo.outputPath('07-receipt-complete.png') });
      await page.reload();
      await expect(page.getByText('Payment confirmed', { exact: true })).toBeVisible();
      await page.getByRole('link', { name: 'Go to billing', exact: true }).click();
      await expect(page).toHaveURL(`${webUrl}/designer/plan-billing`);
      await expect(page.getByText('Corporate', { exact: true }).first()).toBeVisible();
      expect((await context.request.get(`${apiUrl}/api/billing/subscription`)).ok()).toBeTruthy();
      expect(await providerMutationCount(context, '/subscriptions')).toBe(before + 2);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBeTruthy();
      expect(errors).toEqual([]);
    } finally {
      await owner.dispose();
    }
  });
}

for (const width of [1412, 390]) {
  test(`upgrade resumes the same adjustment after mandate authorization at ${width}px`, async ({
    page,
    context,
  }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 844 });
    const owner = await createBillingOwner(context, 'professional_plus');
    const providerCreates = await providerMutationCount(context, '/subscriptions');
    const ordersBefore = await providerMutationCount(context, '/orders');
    const opened: { kind: string; id: string }[] = [];
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.exposeBinding(
      'confirmReplacementPayment',
      async (_source, kind: string, id: string) => {
        opened.push({ kind, id });
        const response = await context.request.get(`${apiUrl}/api/billing/replacement`);
        expect(response.ok()).toBeTruthy();
        const checkout = billingReplacementCheckoutSchema.parse(await response.json());
        expect(checkout).not.toBeNull();
        expect(id).toBe(
          kind === 'subscription' ? checkout!.razorpaySubscriptionId : checkout!.razorpayOrderId,
        );
        let paymentId: string;
        if (kind === 'subscription') {
          paymentId = `pay_auth_${owner.org.id}`;
          const authorized = await context.request.post(
            `${providerUrl}/billing-fixture/subscriptions`,
            {
              data: {
                id,
                plan_id: 'plan_e2e_corporate',
                status: 'authenticated',
                start_at: Math.floor(new Date(checkout!.effectiveAt).getTime() / 1000),
                current_start: null,
                current_end: null,
              },
            },
          );
          expect(authorized.ok()).toBeTruthy();
        } else {
          expect(kind).toBe('order');
          const captured = await context.request.post(`${providerUrl}/billing-fixture/capture`, {
            data: { orderId: id },
          });
          expect(captured.ok()).toBeTruthy();
          paymentId = razorpayPaymentSchema.parse(await captured.json()).id;
        }
        return {
          razorpay_payment_id: paymentId,
          [`razorpay_${kind}_id`]: id,
          razorpay_signature: createHmac('sha256', 'tickif-e2e-secret')
            .update(kind === 'order' ? `${id}|${paymentId}` : `${paymentId}|${id}`)
            .digest('hex'),
        };
      },
    );
    await page.addInitScript(() => {
      class ReplacementFixture {
        constructor(
          private options: {
            subscription_id?: string;
            order_id?: string;
            modal: { ondismiss: () => void };
            handler: (payment: Record<string, string>) => void;
          },
        ) {}
        on() {}
        open() {
          const dialog = document.createElement('section');
          dialog.setAttribute('role', 'dialog');
          dialog.setAttribute('aria-label', 'Synthetic replacement checkout');
          dialog.style.cssText =
            'position:fixed;inset:0;z-index:999999;display:grid;place-content:center;background:white;gap:20px;padding:24px';
          const kind = this.options.order_id ? 'order' : 'subscription';
          const id = this.options.order_id ?? this.options.subscription_id!;
          const confirm = document.createElement('button');
          confirm.textContent =
            kind === 'order' ? 'Capture adjustment' : 'Authorize renewal mandate';
          confirm.onclick = async () => {
            confirm.disabled = true;
            const bridge = window as typeof window & {
              confirmReplacementPayment: (
                kind: string,
                id: string,
              ) => Promise<Record<string, string>>;
            };
            const payment = await bridge.confirmReplacementPayment(kind, id);
            dialog.remove();
            this.options.handler(payment);
          };
          const close = document.createElement('button');
          close.textContent = 'Close adjustment checkout';
          close.onclick = () => {
            dialog.remove();
            this.options.modal.ondismiss();
          };
          dialog.append(confirm, close);
          document.body.append(dialog);
        }
      }
      Object.assign(window, { Razorpay: ReplacementFixture });
    });
    try {
      await page.goto('/designer/plan-billing/subscribe');
      await page.getByRole('button', { name: 'Upgrade to Corporate', exact: true }).click();
      await expect(
        page.getByRole('dialog', { name: 'Plan subscription', exact: true }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Confirm plan change', exact: true }).click();
      await page.getByRole('button', { name: 'Continue plan change', exact: true }).click();
      await page.getByRole('button', { name: 'Authorize renewal mandate', exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'Capture adjustment', exact: true }),
      ).toBeVisible();
      expect((await owner.subscription())?.planTier).toBe('professional_plus');
      await page.getByRole('button', { name: 'Close adjustment checkout', exact: true }).click();
      await expect(page).toHaveURL(/\/subscribe\/closed\?plan=corporate$/);
      await expect(page.getByRole('link', { name: 'Choose your plan', exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByRole('link', { name: 'Choose your plan', exact: true })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('upgrade-closed.png') });
      await page.getByRole('link', { name: 'Back to billing', exact: true }).first().click();
      await page.getByRole('link', { name: 'Manage Subscription', exact: true }).click();
      await expect(page).toHaveURL(/\/designer\/plan-billing\/subscribe$/);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      // A provider-authorized mandate is protected; only its unpaid adjustment can resume.
      await expect(
        page.getByRole('button', { name: 'Switch to Hobby', exact: true }),
      ).toBeDisabled();
      await page.getByRole('button', { name: 'Upgrade to Corporate', exact: true }).click();
      await page.getByRole('button', { name: 'Confirm plan change', exact: true }).click();
      await page.getByRole('button', { name: 'Continue plan change', exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'Capture adjustment', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Authorize renewal mandate', exact: true }),
      ).toHaveCount(0);
      await page.getByRole('button', { name: 'Capture adjustment', exact: true }).click();
      await expect(page).toHaveURL(/\/subscribe\/complete\?plan=corporate$/);
      await expect(page.getByText('Payment confirmed', { exact: true })).toBeVisible();
      await expect(page.getByRole('article', { name: 'Receipt', exact: true })).toContainText(
        'Corporate plan',
      );
      await page.screenshot({ path: testInfo.outputPath('upgrade-receipt.png') });
      expect((await owner.subscription())?.planTier).toBe('corporate');
      expect((await owner.subscription())?.razorpayStatus).toBe('authenticated');
      expect(opened.map((entry) => entry.kind)).toEqual(['subscription', 'order']);
      expect(await providerMutationCount(context, '/subscriptions')).toBe(providerCreates + 1);
      expect(await providerMutationCount(context, '/orders')).toBe(ordersBefore + 1);
      expect(
        await providerMutationCount(context, `/subscriptions/${owner.provider.id}/cancel`),
      ).toBe(1);
      await page.reload();
      await expect(page.getByText('Payment confirmed', { exact: true })).toBeVisible();
      expect(errors).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBeTruthy();
    } finally {
      await owner.dispose();
    }
  });
}
