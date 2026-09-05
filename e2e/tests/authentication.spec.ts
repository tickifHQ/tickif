import { randomInt, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { db, eq, schema } from '@repo/db';
import { assertTestDb } from '@repo/db/testing';
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
  const email = `email-${randomUUID()}@test.local`;
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
    expect(body.user.role).not.toBe('admin');
    await page.screenshot({
      path: testInfo.outputPath('email-onboarding.png'),
      animations: 'disabled',
    });
  } finally {
    await assertTestDb();
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
    await page.goto('/login');
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
