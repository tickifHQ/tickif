import { randomInt, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { config } from '@repo/config';
import { db, desc, eq, schema } from '@repo/db';
import {
  assertTestDb,
  makeDesigner,
  makeOrganization,
  makeUser,
  migrateTestDb,
} from '@repo/db/testing';

const apiUrl = 'http://localhost:3001';

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
      headers: { origin: 'http://localhost:3000' },
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
    await page.getByRole('button', { name: 'Refresh payments' }).click();
    await expect(page.getByText(/Payment history could not be loaded/)).toBeVisible();
    expect(runtimeErrors).toEqual([]);
  } finally {
    await assertTestDb();
    await db.delete(schema.organization).where(eq(schema.organization.id, org.id));
    await db.delete(schema.user).where(eq(schema.user.id, user.id));
  }
});
