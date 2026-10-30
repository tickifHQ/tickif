import { apiUrl as stackApiUrl, webUrl as stackWebUrl, providerUrl } from '../lib/environment';
import { signInPhone } from '../lib/auth';
import {
  createBillingOwner,
  deliverSubscriptionEvent,
  providerMutationCount,
} from '../lib/billing';
import { createHmac, randomInt, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { config } from '@repo/config';
import { billingChangePreviewSchema } from '@repo/contracts';
import { db, desc, eq, schema } from '@repo/db';
import {
  assertTestDb,
  makeDesigner,
  makeOrganization,
  makeUser,
  migrateTestDb,
} from '@repo/db/testing';

const apiUrl = stackApiUrl;

test('billing owner sees real payments, recovers an existing mandate, and gets honest refresh errors', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120_000);
  const database = new URL(config.DATABASE_URL);
  if (
    !['localhost', '127.0.0.1'].includes(database.hostname) ||
    !database.pathname.endsWith('_test') ||
    config.DATABASE_URL !== config.DATABASE_URL_TEST
  ) {
    throw new Error(
      'Billing E2E requires matching local DATABASE_URL and DATABASE_URL_TEST ending in _test.',
    );
  }
  await migrateTestDb(config.DATABASE_URL);
  await assertTestDb();
  const user = await makeUser({
    role: 'designer',
    status: 'active',
    name: 'Synthetic billing owner',
    phoneNumber: `+9196${randomInt(10_000_000, 99_999_999)}`,
    phoneNumberVerified: true,
  });
  const org = await makeOrganization({ name: `Billing smoke ${randomUUID()}` });
  await db.insert(schema.member).values({
    id: randomUUID(),
    organizationId: org.id,
    userId: user.id,
    role: 'owner',
    createdAt: new Date(),
  });
  await makeDesigner({ orgId: org.id, userId: user.id, status: 'active' });
  const providerId = `sub_smoke_${org.id}`;
  const [sub] = await db
    .insert(schema.subscription)
    .values({
      organizationId: org.id,
      planTier: 'corporate',
      subscriptionState: 'payment_failed',
      razorpayStatus: 'pending',
      razorpaySubscriptionId: providerId,
    })
    .returning();
  await db.insert(schema.paymentTransaction).values({
    subscriptionId: sub!.id,
    razorpayPaymentId: `pay_smoke_${org.id}`,
    amount: 799900,
    currency: 'INR',
    status: 'failed',
    payload: {},
  });
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  try {
    // Use real local Better Auth; retrieve only this synthetic phone's one-time code.
    const authOptions = {
      headers: { origin: stackWebUrl },
      data: { phoneNumber: user.phoneNumber },
    };
    expect(
      (await context.request.post(`${apiUrl}/api/auth/phone-number/send-otp`, authOptions)).ok(),
    ).toBeTruthy();
    const [verification] = await db
      .select()
      .from(schema.verification)
      .where(eq(schema.verification.identifier, user.phoneNumber!))
      .orderBy(desc(schema.verification.createdAt))
      .limit(1);
    const code = verification?.value.split(':')[0];
    if (!code) throw new Error('Synthetic OTP not available; check local API database alignment.');
    expect(
      (
        await context.request.post(`${apiUrl}/api/auth/phone-number/verify`, {
          ...authOptions,
          data: { phoneNumber: user.phoneNumber, code },
        })
      ).ok(),
    ).toBeTruthy();
    expect(
      (
        await context.request.put(`${apiUrl}/api/orgs/context`, {
          headers: authOptions.headers,
          data: { kind: 'organization', organizationId: org.id },
        })
      ).ok(),
    ).toBeTruthy();

    // Only provider boundaries are stubbed. Auth, page SSR, subscription reads and history stay real.
    await page.route('**/api/billing/payment-method', (route) =>
      route.fulfill({
        json: {
          razorpaySubscriptionId: providerId,
          razorpayKeyId: 'rzp_test_smoke',
          shortUrl: null,
          prefill: { name: null, email: null, contact: null },
        },
      }),
    );
    await page.route('**/api/billing/verify-payment', async (route) => {
      expect(route.request().postDataJSON()).toMatchObject({ razorpaySubscriptionId: providerId });
      await route.fulfill({ json: { verified: true } });
    });
    await page.addInitScript(() => {
      class RazorpayFixture {
        constructor(private options: Record<string, unknown>) {}
        on() {}
        open() {
          if (this.options.subscription_card_change !== true)
            throw new Error('Expected existing-subscription card update');
          const handler = this.options.handler as (payload: Record<string, string>) => void;
          handler({
            razorpay_payment_id: 'pay_synthetic_callback',
            razorpay_subscription_id: String(this.options.subscription_id),
            razorpay_signature: 'synthetic-signature',
          });
        }
      }
      Object.assign(window, { Razorpay: RazorpayFixture });
    });
    await page.goto('/designer/plan-billing');
    await expect(page.getByRole('heading', { name: 'Plan & Billing' })).toBeVisible();
    await expect(page.getByText(providerId, { exact: true })).toHaveCount(0);
    await expect(page.getByText(`pay_smoke_${org.id}`, { exact: true })).toBeVisible();
    await expect(page.getByText('₹7,999.00', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Update Payment Method', exact: true }).first().click();
    await expect(page.getByText(/Payment method verified/)).toBeVisible();
    // A verified callback does not fake recovered entitlements while the provider is pending.
    await expect(page.getByText('Payment Failed', { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('billing-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    const copyButton = page.getByRole('button', { name: 'Copy subscription ID', exact: true });
    await expect(copyButton).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('billing-mobile.png'), fullPage: true });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBeTruthy();
    await page.route('**/api/billing/payments?*', (route) =>
      route.fulfill({ status: 503, json: { error: { message: 'Synthetic outage' } } }),
    );
    await expect(page.getByRole('button', { name: /Refresh/ })).toHaveCount(0);
    await expect(page.getByText(/We could not update your payments/)).toBeVisible({
      timeout: 45_000,
    });
    expect(runtimeErrors).toEqual([]);
  } finally {
    await assertTestDb();
    await db.delete(schema.organization).where(eq(schema.organization.id, org.id));
    await db.delete(schema.user).where(eq(schema.user.id, user.id));
  }
});

for (const [tier, label] of [
  ['hobby', 'Hobby'],
  ['professional_plus', 'Professional+'],
  ['corporate', 'Corporate'],
] as const) {
  test(`${label} owner opens comparison from billing or directly at desktop and mobile widths`, async ({
    page,
    context,
  }, testInfo) => {
    test.setTimeout(120_000);
    const owner = await createBillingOwner(context, tier);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      for (const path of ['/designer/plan-billing', '/designer/plan-billing/subscribe']) {
        await page.goto(path);
        if (path === '/designer/plan-billing') {
          await expect(
            page.getByRole('link', { name: 'Manage Subscription', exact: true }),
          ).toBeVisible();
          for (const width of [1280, 390]) {
            await page.setViewportSize({ width, height: 844 });
            const includes = page.getByRole('heading', { name: 'Your Plan Includes', exact: true });
            const history = page.getByText('Payment history', { exact: true });
            await expect(includes).toBeVisible();
            await expect(history).toBeVisible();
            const includesTop = await includes.evaluate(
              (element) => element.getBoundingClientRect().top,
            );
            const historyTop = await history.evaluate(
              (element) => element.getBoundingClientRect().top,
            );
            expect(includesTop).toBeLessThan(historyTop);
            await page.screenshot({
              path: testInfo.outputPath(`${tier}-overview-${width}.png`),
              fullPage: true,
            });
          }
          await expect(
            page.getByRole('region', { name: 'Choose your plan', exact: true }),
          ).toHaveCount(0);
          await page.getByRole('link', { name: 'Manage Subscription', exact: true }).click();
          await expect(page).toHaveURL(/\/designer\/plan-billing\/subscribe$/);
          await expect(page.getByRole('dialog')).not.toBeVisible();
        }
        for (const width of [1280, 390]) {
          await page.setViewportSize({ width, height: 900 });
          await expect(
            page.getByRole('button', { name: `${label} is your current plan`, exact: true }),
          ).toBeVisible();
          await expect(
            page.getByText('Checking available billing actions…', { exact: true }),
          ).toHaveCount(0);
          await page
            .getByRole('heading', { name: 'Choose your plan', exact: true })
            .scrollIntoViewIfNeeded();
          for (const price of ['₹0', '₹2,999', '₹7,999'])
            await expect(page.getByText(price, { exact: true }).first()).toBeVisible();
          await expect(
            page.getByRole(width >= 768 ? 'table' : 'region', {
              name: width >= 768 ? 'Compare plan features' : 'Plan features by tier',
            }),
          ).toBeVisible();
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          ).toBe(true);
          await page.screenshot({
            path: testInfo.outputPath(`${tier}-${path.split('/').at(-1)}-${width}.png`),
            fullPage: true,
          });
          if (width >= 768) {
            const buttons = page
              .getByRole('region', { name: 'Choose your plan', exact: true })
              .locator('[data-slot="card-footer"] button');
            await expect(buttons).toHaveCount(3);
            const bounds = await buttons.evaluateAll((elements) =>
              elements.map((element) => {
                const { top, bottom } = element.getBoundingClientRect();
                return { top, bottom };
              }),
            );
            for (const edge of ['top', 'bottom'] as const) {
              const positions = bounds.map((bound) => bound[edge]);
              expect(Math.max(...positions) - Math.min(...positions)).toBeLessThanOrEqual(1);
            }
            await page
              .getByRole('region', { name: 'Choose your plan', exact: true })
              .locator(':scope > .grid')
              .screenshot({
                path: testInfo.outputPath(`${tier}-${path.split('/').at(-1)}-aligned-actions.png`),
              });
            await page
              .getByRole('table', { name: 'Compare plan features' })
              .scrollIntoViewIfNeeded();
            await page.screenshot({
              path: testInfo.outputPath(`${tier}-${path.split('/').at(-1)}-features.png`),
            });
          }
        }
      }
      expect(errors).toEqual([]);
    } finally {
      await owner.dispose();
    }
  });
}

test('direct Corporate checkout restores choices after dismissal and activates only from provider evidence', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  const owner = await createBillingOwner(context);
  const targets: unknown[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/api/billing/subscribe') && request.method() === 'POST')
      targets.push(request.postDataJSON().targetTier);
  });
  await page.addInitScript(() => {
    class DismissedCheckout {
      constructor(private options: { modal: { ondismiss: () => void } }) {}
      on() {}
      open() {
        this.options.modal.ondismiss();
      }
    }
    Object.assign(window, { Razorpay: DismissedCheckout });
  });
  try {
    await page.goto('/designer/plan-billing');
    await page.getByRole('link', { name: 'Manage Subscription', exact: true }).click();
    const upgrade = page.getByRole('button', { name: 'Upgrade to Corporate', exact: true });
    await expect(upgrade).toBeEnabled();
    await upgrade.focus();
    await page.keyboard.press('Enter');
    const confirmation = page.getByRole('dialog', { name: 'Plan subscription', exact: true });
    await expect(confirmation).toBeVisible();
    await expect(
      confirmation.getByRole('region', { name: 'Choose your plan', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Upgrade to Corporate', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Continue to payment', exact: true }).click();
    await expect(page).toHaveURL(/\/subscribe\/closed\?plan=corporate$/);
    await expect(page.getByRole('link', { name: 'Choose your plan', exact: true })).toBeVisible();
    expect(targets).toEqual(['corporate']);
    const created = await owner.subscription();
    expect(created?.planTier).toBe('hobby');
    expect(created?.razorpayStatus).toBe('created');
    await page.reload();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    expect(targets).toEqual(['corporate']);
    await expect(page.getByRole('heading', { name: 'Checkout closed', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Choose your plan', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Upgrade to Professional+', exact: true }),
    ).toBeEnabled();
    await expect(page.getByText('Selected plan', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Upgrade to Corporate', exact: true }).click();
    await page.getByRole('button', { name: 'Continue to payment', exact: true }).click();
    // Wait for dismissal before delivering provider evidence for the explicitly chosen tier.
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('status', { name: 'Secure checkout' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Choose your plan', exact: true })).toBeVisible();
    expect(targets).toEqual(['corporate', 'corporate']);
    expect((await owner.subscription())?.razorpaySubscriptionId).toBe(
      created?.razorpaySubscriptionId,
    );
    const now = Math.floor(Date.now() / 1000);
    await deliverSubscriptionEvent(context, 'subscription.activated', {
      id: created!.razorpaySubscriptionId,
      entity: 'subscription',
      plan_id: 'plan_e2e_corporate',
      status: 'active',
      current_start: now,
      current_end: now + 30 * 86400,
      created_at: now,
      notes: { organizationId: owner.org.id, tier: 'corporate' },
    });
    await expect.poll(async () => (await owner.subscription())?.planTier).toBe('corporate');
    await expect(page.getByRole('heading', { name: 'Payment confirmed', exact: true })).toBeVisible(
      {
        timeout: 15_000,
      },
    );
    await page.getByRole('link', { name: 'Go to billing', exact: true }).click();
    await page.getByRole('link', { name: 'Manage Subscription', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Corporate is your current plan', exact: true }),
    ).toBeVisible();
  } finally {
    await owner.dispose();
  }
});

for (const scenario of [
  { source: 'professional_plus', abandoned: 'Upgrade to Corporate' },
  { source: 'corporate', abandoned: 'Downgrade to Professional+' },
] as const) {
  test(`abandoning ${scenario.source} plan change restores choices including Hobby`, async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    const owner = await createBillingOwner(context, scenario.source);
    await page.addInitScript(() => {
      class DismissedCheckout {
        constructor(private options: { modal: { ondismiss: () => void } }) {}
        on() {}
        open() {
          this.options.modal.ondismiss();
        }
      }
      Object.assign(window, { Razorpay: DismissedCheckout });
    });
    const cancelPath = `/subscriptions/${owner.provider.id}/cancel`;
    try {
      await page.setViewportSize({
        width: scenario.source === 'corporate' ? 390 : 1412,
        height: 900,
      });
      await page.goto('/designer/plan-billing/subscribe');
      await page.getByRole('button', { name: scenario.abandoned, exact: true }).click();
      await expect(
        page.getByRole('dialog', { name: 'Plan subscription', exact: true }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Confirm plan change', exact: true }).click();
      await page.getByRole('button', { name: 'Continue plan change', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Checkout closed', exact: true }),
      ).toBeVisible();
      expect((await owner.subscription())?.planTier).toBe(scenario.source);
      expect(await providerMutationCount(context, cancelPath)).toBe(0);
      await page.getByRole('link', { name: 'Choose your plan', exact: true }).click();
      await expect(page).toHaveURL(`${stackWebUrl}/designer/plan-billing/subscribe`);
      await page.reload();
      await expect(
        page.getByRole('button', { name: scenario.abandoned, exact: true }),
      ).toBeEnabled();
      await expect(
        page.getByRole('button', { name: 'Switch to Hobby', exact: true }),
      ).toBeEnabled();
      await page.getByRole('button', { name: 'Switch to Hobby', exact: true }).click();
      // Reviewing Hobby must not cancel paid access; explicit confirmation is required.
      expect(await providerMutationCount(context, cancelPath)).toBe(0);
      await page.getByRole('button', { name: 'Schedule cancellation', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Plan change scheduled', exact: true }),
      ).toBeVisible();
      expect(await providerMutationCount(context, cancelPath)).toBe(1);
      expect(await owner.subscription()).toMatchObject({
        planTier: scenario.source,
        cancelAtPeriodEnd: true,
      });
      const replacements = await db
        .select()
        .from(schema.billingReplacement)
        .where(eq(schema.billingReplacement.organizationId, owner.org.id));
      expect(replacements).toHaveLength(1);
      expect(replacements[0]?.status).toBe('failed');
    } finally {
      await owner.dispose();
    }
  });
}

test('paid recovery preserves the accepted downgrade across session loss and cancellation requires a fresh preview', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  const owner = await createBillingOwner(context, 'corporate', { unverifiedPeriod: true });
  let replacementRequests = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/billing/subscribe'))
      replacementRequests += 1;
  });
  await page.addInitScript(() => {
    class DismissedCheckout {
      constructor(private options: { modal: { ondismiss: () => void } }) {}
      on() {}
      open() {
        this.options.modal.ondismiss();
      }
    }
    Object.assign(window, { Razorpay: DismissedCheckout });
  });
  try {
    await page.goto('/designer/plan-billing');
    await page.getByRole('link', { name: 'Manage Subscription', exact: true }).click();
    await page.getByRole('button', { name: 'Switch to Hobby', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Schedule cancellation', exact: true }),
    ).toBeVisible();
    // Another billing actor/provider change invalidates the reviewed date. No cancellation may run.
    const changedProvider = { ...owner.provider, current_end: owner.provider.current_end + 86400 };
    expect(
      (
        await context.request.post(`${providerUrl}/billing-fixture/subscriptions`, {
          data: changedProvider,
        })
      ).ok(),
    ).toBeTruthy();
    await page.getByRole('button', { name: 'Schedule cancellation', exact: true }).click();
    await expect(
      page.getByRole('dialog', { name: 'Plan subscription', exact: true }).getByRole('alert'),
    ).toContainText('Billing details changed');
    expect((await owner.subscription())?.cancelAtPeriodEnd).toBe(false);
    expect(await providerMutationCount(context, `/subscriptions/${owner.provider.id}/cancel`)).toBe(
      0,
    );
    await page.getByRole('button', { name: 'Retry Hobby', exact: true }).click();
    await page.getByRole('button', { name: 'Schedule cancellation', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Plan change scheduled' })).toBeVisible();
    expect((await owner.subscription())?.planTier).toBe('corporate');
    expect((await owner.subscription())?.cancelAtPeriodEnd).toBe(true);
    expect(await providerMutationCount(context, `/subscriptions/${owner.provider.id}/cancel`)).toBe(
      1,
    );
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Downgrade to Professional+', exact: true }),
    ).toHaveCount(0);
    // Backend-only compatibility: save a target through the authenticated contract;
    // the simplified UI offers no new plan selection while cancellation is scheduled.
    const quoteResponse = await context.request.post(`${apiUrl}/api/billing/change-preview`, {
      headers: { origin: stackWebUrl },
      data: { targetTier: 'professional_plus' },
    });
    expect(quoteResponse.ok()).toBeTruthy();
    const quote = billingChangePreviewSchema.parse(await quoteResponse.json());
    const saveResponse = await context.request.post(`${apiUrl}/api/billing/recovery`, {
      headers: { origin: stackWebUrl },
      data: {
        targetTier: 'professional_plus',
        previewToken: quote.previewToken,
        expectedRecoveryId: null,
        expectedRevision: null,
        operationId: randomUUID(),
      },
    });
    expect(saveResponse.ok(), await saveResponse.text()).toBeTruthy();
    await context.clearCookies();
    await page.evaluate(() => sessionStorage.clear());
    await signInPhone(context, owner.user.phoneNumber);
    expect(
      (
        await context.request.put(`${apiUrl}/api/orgs/context`, {
          headers: { origin: stackWebUrl },
          data: { kind: 'organization', organizationId: owner.org.id },
        })
      ).ok(),
    ).toBeTruthy();
    await page.reload();
    await expect(page.getByRole('status', { name: 'Billing status', exact: true })).toContainText(
      'Professional+ saved',
    );
    const intents = await db
      .select()
      .from(schema.billingRecovery)
      .where(eq(schema.billingRecovery.organizationId, owner.org.id));
    expect(intents).toHaveLength(1);
    expect(intents[0]?.targetTier).toBe('professional_plus');
    await deliverSubscriptionEvent(context, 'subscription.cancelled', {
      ...changedProvider,
      entity: 'subscription',
      status: 'cancelled',
      current_end: Math.floor(Date.now() / 1000) - 1,
      ended_at: Math.floor(Date.now() / 1000),
      cancel_at_cycle_end: true,
    });
    await expect.poll(async () => (await owner.subscription())?.planTier).toBe('hobby');
    await expect(
      page.getByRole('button', { name: 'Hobby is your current plan', exact: true }),
    ).toBeVisible({ timeout: 45_000 });
    await page.getByRole('button', { name: 'Review Professional+', exact: true }).click();
    expect(replacementRequests).toBe(0);
    await page.getByRole('button', { name: 'Continue to payment', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Choose your plan', exact: true })).toBeVisible();
    const replacement = await owner.subscription();
    expect(replacementRequests).toBe(1);
    expect(replacement?.planTier).toBe('hobby');
    expect(replacement?.razorpaySubscriptionId).not.toBe(owner.provider.id);
    await deliverSubscriptionEvent(context, 'subscription.activated', {
      ...owner.provider,
      id: replacement!.razorpaySubscriptionId,
      plan_id: 'plan_e2e_professional',
      entity: 'subscription',
      status: 'active',
      notes: { organizationId: owner.org.id, tier: 'professional_plus' },
    });
    await expect.poll(async () => (await owner.subscription())?.planTier).toBe('professional_plus');
    await expect(page.getByRole('heading', { name: 'Payment confirmed', exact: true })).toBeVisible(
      {
        timeout: 15_000,
      },
    );
    await page.getByRole('link', { name: 'Go to billing', exact: true }).click();
    await page.getByRole('link', { name: 'Manage Subscription', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Professional+ is your current plan', exact: true }),
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
  } finally {
    await owner.dispose();
  }
});

test('Corporate checkout refreshes the retained workspace and unlocks team and branch management without a reload', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1412, height: 900 });
  const owner = await createBillingOwner(context);
  const documentNavigations: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.exposeBinding(
    'authorizeCorporateCheckout',
    async (_source, subscriptionId: string) => {
      expect(subscriptionId).toBe((await owner.subscription())?.razorpaySubscriptionId);
      const now = Math.floor(Date.now() / 1000);
      const authorized = await context.request.post(
        `${providerUrl}/billing-fixture/subscriptions`,
        {
          data: {
            id: subscriptionId,
            plan_id: 'plan_e2e_corporate',
            status: 'authenticated',
            current_start: now,
            current_end: now + 30 * 86400,
            notes: { organizationId: owner.org.id, tier: 'corporate' },
          },
        },
      );
      expect(authorized.ok()).toBeTruthy();
      const paymentId = `pay_workspace_${owner.org.id}`;
      return {
        razorpay_subscription_id: subscriptionId,
        razorpay_payment_id: paymentId,
        razorpay_signature: createHmac('sha256', 'tickif-e2e-secret')
          .update(`${paymentId}|${subscriptionId}`)
          .digest('hex'),
      };
    },
  );
  await page.addInitScript(() => {
    class CorporateCheckoutFixture {
      constructor(
        private options: {
          subscription_id: string;
          handler: (payment: Record<string, string>) => void;
        },
      ) {}
      on() {}
      async open() {
        const bridge = window as typeof window & {
          authorizeCorporateCheckout: (id: string) => Promise<Record<string, string>>;
        };
        this.options.handler(await bridge.authorizeCorporateCheckout(this.options.subscription_id));
      }
    }
    Object.assign(window, { Razorpay: CorporateCheckoutFixture });
  });
  try {
    await page.goto('/designer/plan-billing');
    page.on('request', (request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame())
        documentNavigations.push(request.url());
    });
    const workspaceSwitcher = page.getByRole('button', { name: 'Switch context', exact: true });
    await expect(workspaceSwitcher).toContainText('Hobby');
    await page.getByRole('link', { name: 'Branches', exact: true }).click();
    await expect(page).toHaveURL(`${stackWebUrl}/designer/branches`);
    await expect(
      page.getByRole('heading', { name: 'Branch management is a Corporate feature', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('table', { name: 'Branches', exact: true })).toHaveCount(0);
    await page.getByRole('link', { name: 'Team & Roles', exact: true }).click();
    await expect(page).toHaveURL(`${stackWebUrl}/designer/terms-roles`);
    await expect(
      page.getByRole('heading', { name: 'Team management is a Corporate feature', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Members', exact: true })).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Leave organisation', exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Send invite', exact: true })).toHaveCount(0);
    const upgrade = page.getByRole('link', { name: 'View Corporate plans', exact: true });
    await expect(upgrade).toHaveAttribute(
      'href',
      '/designer/plan-billing/subscribe?tier=corporate',
    );
    await upgrade.click();
    await expect(page).toHaveURL(/\/designer\/plan-billing\/subscribe(?:\?.*)?$/);
    await expect(
      page.getByRole('dialog', { name: 'Plan subscription', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Continue to payment', exact: true }).click();
    await expect(page).toHaveURL(/\/subscribe\/complete\?plan=corporate$/);
    await expect(page.getByText('Confirming your payment', { exact: true })).toBeVisible();
    expect((await owner.subscription())?.planTier).toBe('hobby');
    const pending = await owner.subscription();
    const now = Math.floor(Date.now() / 1000);
    const activeSubscription = {
      id: pending!.razorpaySubscriptionId,
      entity: 'subscription',
      status: 'active',
      plan_id: 'plan_e2e_corporate',
      current_start: now,
      current_end: now + 30 * 86400,
      created_at: now,
      notes: { organizationId: owner.org.id, tier: 'corporate' },
    };
    await deliverSubscriptionEvent(context, 'subscription.activated', activeSubscription);
    await deliverSubscriptionEvent(context, 'subscription.charged', activeSubscription, {
      id: `pay_workspace_${owner.org.id}`,
      entity: 'payment',
      amount: 799900,
      currency: 'INR',
      status: 'captured',
      created_at: now,
    });
    await expect(page.getByText('Payment confirmed', { exact: true })).toBeVisible();
    await expect(page.getByRole('article', { name: 'Receipt', exact: true })).toBeVisible();
    await expect(workspaceSwitcher).toContainText('Corporate');
    await page.getByRole('link', { name: 'Team & Roles', exact: true }).click();
    await expect(page).toHaveURL(`${stackWebUrl}/designer/terms-roles`);
    await expect(
      page.getByRole('heading', { name: 'Team management is a Corporate feature', exact: true }),
    ).toHaveCount(0);
    const inviteEmail = `workspace-${owner.org.id}@example.test`;
    await page.getByRole('tab', { name: 'Invitations', exact: true }).click();
    await page.getByRole('button', { name: 'Invite a teammate', exact: true }).click();
    const inviteDialog = page.getByRole('dialog', { name: 'Invite a teammate', exact: true });
    await inviteDialog.getByLabel('Work email', { exact: true }).fill(inviteEmail);
    await inviteDialog.getByRole('button', { name: 'Send invite', exact: true }).click();
    await expect(inviteDialog).not.toBeVisible();
    await expect(
      page.getByRole('status').filter({ hasText: `Invitation created for ${inviteEmail}.` }),
    ).toBeVisible();
    await expect(page.getByText(inviteEmail, { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Branches', exact: true }).click();
    await expect(page).toHaveURL(`${stackWebUrl}/designer/branches`);
    const branchName = `Upgraded branch ${owner.org.id.slice(0, 8)}`;
    await page.getByRole('button', { name: 'Create new branch', exact: true }).click();
    await page.getByLabel('Branch name', { exact: true }).fill(branchName);
    await page.getByRole('button', { name: 'Create branch', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: `Branch ${branchName} created.` }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: branchName, exact: true })).toBeVisible();
    expect(documentNavigations).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await owner.dispose();
  }
});

test('fresh Hobby organization shows actual seat and branch usage without a subscription', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await assertTestDb();
  const user = await makeUser({
    role: 'designer',
    status: 'active',
    phoneNumberVerified: true,
    phoneNumber: `+9196${randomInt(10_000_000, 99_999_999)}`,
  });
  const org = await makeOrganization();
  try {
    await db.insert(schema.member).values({
      id: randomUUID(),
      organizationId: org.id,
      userId: user.id,
      role: 'owner',
      createdAt: new Date(),
    });
    await makeDesigner({ orgId: org.id, userId: user.id, status: 'active' });
    await signInPhone(context, user.phoneNumber);
    expect(
      (
        await context.request.put(`${apiUrl}/api/orgs/context`, {
          headers: { origin: stackWebUrl },
          data: { kind: 'organization', organizationId: org.id },
        })
      ).ok(),
    ).toBeTruthy();
    await page.goto('/designer/plan-billing');
    await expect(page.getByRole('heading', { name: 'Plan & Billing' })).toBeVisible();
    await expect(page.getByText('1 active seats', { exact: true })).toBeVisible();
    await expect(page.getByText('1 active branches', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('1 active seats', { exact: true })).toBeVisible();
    await expect(page.getByText('1 active branches', { exact: true })).toBeVisible();
    expect(
      await db
        .select()
        .from(schema.subscription)
        .where(eq(schema.subscription.organizationId, org.id)),
    ).toEqual([]);
  } finally {
    await assertTestDb();
    await db.delete(schema.organization).where(eq(schema.organization.id, org.id));
    await db.delete(schema.user).where(eq(schema.user.id, user.id));
  }
});
