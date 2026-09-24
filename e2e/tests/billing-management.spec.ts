import { apiUrl as stackApiUrl, webUrl as stackWebUrl, providerUrl } from '../lib/environment';
import { signInPhone } from '../lib/auth';
import {
  createBillingOwner,
  deliverSubscriptionEvent,
  providerMutationCount,
} from '../lib/billing';
import { randomInt, randomUUID } from 'node:crypto';
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
    await expect(page.getByText(providerId, { exact: true })).toBeVisible();
    await expect(page.getByText(`pay_smoke_${org.id}`, { exact: true })).toBeVisible();
    await expect(page.getByText('₹7,999.00', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Update Payment Method', exact: true }).first().click();
    await expect(page.getByText(/Payment method verified/)).toBeVisible();
    // A verified callback does not fake recovered entitlements while the provider is pending.
    await expect(page.getByText('Payment Failed', { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('billing-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    const copyButton = page.getByRole('button', { name: 'Copy subscription ID', exact: true });
    await expect
      .poll(() =>
        copyButton.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return (
            bounds.left >= 0 &&
            bounds.right <= window.innerWidth &&
            element.scrollWidth <= element.clientWidth
          );
        }),
      )
      .toBe(true);
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
  test(`${label} owner can compare all plans on both billing pages at desktop and mobile widths`, async ({
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

test('direct Corporate checkout survives provider dismissal and reload, then activates only from provider evidence', async ({
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
    const upgrade = page.getByRole('button', { name: 'Upgrade to Corporate', exact: true });
    await expect(upgrade).toBeEnabled();
    await upgrade.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Continue to payment', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Continue checkout', exact: true }),
    ).toBeVisible();
    expect(targets).toEqual(['corporate']);
    const created = await owner.subscription();
    expect(created?.planTier).toBe('hobby');
    expect(created?.razorpayStatus).toBe('created');
    await page.reload();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    expect(targets).toEqual(['corporate']);
    await expect(page.getByText('Selected plan', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Continue checkout', exact: true }).click();
    await page.getByRole('button', { name: 'Continue to payment', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Continue checkout', exact: true }),
    ).toBeVisible();
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
    await expect(page.getByRole('heading', { name: 'Plan activated', exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Corporate is your current plan', exact: true }),
    ).toBeVisible();
  } finally {
    await owner.dispose();
  }
});

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
    await expect(page.getByRole('alert')).toContainText('Billing details changed');
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
    await expect(
      page.getByRole('button', { name: 'Continue checkout', exact: true }),
    ).toBeVisible();
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
    await expect(page.getByRole('heading', { name: 'Plan activated', exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: 'Done', exact: true }).click();
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
