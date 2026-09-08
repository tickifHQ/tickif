import { randomInt, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { db, eq, schema } from '@repo/db';
import { assertTestDb } from '@repo/db/testing';
import { onboardDesignerResponseSchema } from '@repo/contracts';
import { apiUrl, webUrl } from '../lib/environment';
import { emailCode, phoneCode, removeSyntheticUserByPhone } from '../lib/auth';

test('phone OTP creates a real visitor session and rejects a wrong code', async ({
  page,
  context,
}, testInfo) => {
  const phoneNumber = `+9191${randomInt(10_000_000, 99_999_999)}`;
  try {
    await page.goto('/login');
    await page.getByPlaceholder('9123456789').fill(phoneNumber.slice(3));
    await page.getByRole('button', { name: 'Get OTP', exact: true }).click();
    const firstDigit = page.getByRole('textbox', { name: 'OTP digit 1', exact: true });
    await expect(firstDigit).toBeVisible();
    const code = await phoneCode(phoneNumber);
    await firstDigit.fill(code === '000000' ? '111111' : '000000');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await firstDigit.fill(code);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page).toHaveURL(/\/onboarding/);
    const session = await context.request.get(`${apiUrl}/api/auth/get-session`);
    const body = await session.json();
    expect(body.user.phoneNumber).toBe(phoneNumber);
    expect(body.user.phoneNumberVerified).toBe(true);
    expect(body.user.role).toBe('visitor');
    await page.screenshot({
      path: testInfo.outputPath('phone-onboarding.png'),
      animations: 'disabled',
    });
  } finally {
    await removeSyntheticUserByPhone(phoneNumber);
  }
});

test('email OTP creates a real session through a local Resend delivery double', async ({
  page,
  context,
}, testInfo) => {
  // One sequential journey now includes signup, deferral, recovery and completed onboarding.
  test.setTimeout(120_000);
  const email = `email-${randomUUID()}@test.local`;
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  let orgId: string | undefined;
  try {
    await page.goto('/login?mode=designer');
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email);
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'OTP digit 1', exact: true })).toBeVisible();
    await page
      .getByRole('textbox', { name: 'OTP digit 1', exact: true })
      .fill(await emailCode(context, email));
    await page.getByRole('button', { name: 'Verify', exact: true }).click();
    await expect(page).toHaveURL(/\/onboarding/);
    const session = await context.request.get(`${apiUrl}/api/auth/get-session`);
    const body = await session.json();
    expect(body.user.email).toBe(email);
    expect(body.user.emailVerified).toBe(true);
    expect(body.user.role).toBe('visitor');
    await page.getByRole('button', { name: /Just me/ }).click();
    await page.getByRole('button', { name: 'Finish later', exact: true }).click();
    await expect(page).toHaveURL(/\/designer\/onboarding\/deferred$/);
    await expect(page.getByRole('link', { name: 'Continue setup' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Explore projects' })).toHaveAttribute(
      'href',
      '/home',
    );
    await expect(page).toHaveTitle(/Finish setup later/);
    await page.screenshot({
      path: testInfo.outputPath('email-onboarding-deferred-desktop.png'),
      animations: 'disabled',
    });

    // Skipping keeps the real session but does not create an empty organization,
    // change role or grant access to designer/admin writes.
    expect(
      await db.select().from(schema.member).where(eq(schema.member.userId, body.user.id)),
    ).toEqual([]);
    expect(
      await db
        .select()
        .from(schema.designerProfile)
        .where(eq(schema.designerProfile.userId, body.user.id)),
    ).toEqual([]);
    const deniedWrite = await context.request.post(`${apiUrl}/api/projects`, {
      headers: { origin: webUrl },
      data: { title: 'Unfinished account must not create this project' },
    });
    expect(deniedWrite.status()).toBe(403);
    expect((await context.request.get(`${apiUrl}/api/admin/projects`)).status()).toBe(403);
    await page.reload();
    await expect(page.getByRole('link', { name: 'Continue setup' })).toBeVisible();
    await page.goto('/designer/dashboard');
    await expect(page).toHaveURL(/\/designer\/onboarding\/deferred$/);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('link', { name: 'Continue setup' })).toBeInViewport();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath('email-onboarding-deferred-mobile.png'),
      animations: 'disabled',
    });

    await page.getByRole('link', { name: 'Continue setup' }).click();
    await page.getByRole('button', { name: /Just me/ }).click();
    await page.getByLabel('Display name', { exact: true }).fill('Synthetic onboarding studio');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const onboardingResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().endsWith('/api/profiles/me'),
    );
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const onboarded = onboardDesignerResponseSchema.parse(await (await onboardingResponse).json());
    orgId = onboarded.organization.id;
    await page.getByRole('button', { name: 'Skip to dashboard', exact: true }).click();
    await expect(page).toHaveURL(/\/designer\/dashboard$/);
    await page.reload();
    await expect(page).toHaveURL(/\/designer\/dashboard$/);
    const completedSession = await context.request.get(
      `${apiUrl}/api/auth/get-session?disableCookieCache=true`,
    );
    expect((await completedSession.json()).user.role).toBe('designer');
    await page.goto('/designer/onboarding/deferred');
    await expect(page).toHaveURL(/\/designer\/dashboard$/);
    expect(pageErrors).toEqual([]);
  } finally {
    await assertTestDb();
    if (orgId) await db.delete(schema.organization).where(eq(schema.organization.id, orgId));
    await db.delete(schema.user).where(eq(schema.user.email, email));
  }
});

test('Google authorization creates a session through the real callback with a local token double', async ({
  page,
  context,
}) => {
  const profile = {
    sub: `google-${randomUUID()}`,
    email: `google-${randomUUID()}@test.local`,
    name: 'Synthetic Google Visitor',
  };
  try {
    await page.route('https://accounts.google.com/**', async (route) => {
      const authorization = new URL(route.request().url());
      expect(authorization.searchParams.get('client_id')).toBe('tickif-e2e-google-client');
      const callback = new URL('/api/auth/callback/google', apiUrl);
      callback.searchParams.set('state', authorization.searchParams.get('state') ?? '');
      callback.searchParams.set(
        'code',
        `tickif-e2e:${Buffer.from(JSON.stringify(profile)).toString('base64url')}`,
      );
      await route.fulfill({ status: 302, headers: { location: callback.href } });
    });
    await page.goto('/login?mode=designer');
    await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
    await expect(page).toHaveURL(/\/onboarding/);
    const session = await context.request.get(`${apiUrl}/api/auth/get-session`);
    const body = await session.json();
    expect(body.user.email).toBe(profile.email);
    expect(body.user.emailVerified).toBe(true);
    const accounts = await db
      .select()
      .from(schema.account)
      .where(eq(schema.account.userId, body.user.id));
    expect(
      accounts.some(
        (account) => account.providerId === 'google' && account.accountId === profile.sub,
      ),
    ).toBe(true);
  } finally {
    await assertTestDb();
    await db.delete(schema.user).where(eq(schema.user.email, profile.email));
  }
});

test('Google denial creates no session and does not lose the local callback boundary', async ({
  context,
}) => {
  const start = await context.request.post(`${apiUrl}/api/auth/sign-in/social`, {
    headers: { origin: webUrl },
    data: { provider: 'google', callbackURL: `${webUrl}/` },
  });
  expect(start.ok()).toBeTruthy();
  const authorization = new URL((await start.json()).url);
  const callback = new URL('/api/auth/callback/google', apiUrl);
  callback.searchParams.set('state', authorization.searchParams.get('state') ?? '');
  callback.searchParams.set('error', 'access_denied');
  await context.request.get(callback.href, { maxRedirects: 0 });
  expect(await (await context.request.get(`${apiUrl}/api/auth/get-session`)).json()).toBeNull();
});
