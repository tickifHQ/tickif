import { apiUrl, webUrl, providerUrl } from './environment';
import type { BrowserContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { db, desc, eq, schema } from '@repo/db';
import { assertTestDb } from '@repo/db/testing';

export async function phoneCode(phoneNumber: string) {
  await assertTestDb();
  const [verification] = await db
    .select()
    .from(schema.verification)
    .where(eq(schema.verification.identifier, phoneNumber))
    .orderBy(desc(schema.verification.createdAt))
    .limit(1);
  const code = verification?.value.split(':')[0];
  if (!code) throw new Error('Synthetic phone OTP was not persisted in the isolated test database');
  return code;
}

export async function signInPhone(context: BrowserContext, phoneNumber: string | null) {
  if (!phoneNumber) throw new Error('Synthetic user needs a phone number');
  const headers = { origin: webUrl };
  expect(
    (
      await context.request.post(`${apiUrl}/api/auth/phone-number/send-otp`, {
        headers,
        data: { phoneNumber },
      })
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await context.request.post(`${apiUrl}/api/auth/phone-number/verify`, {
        headers,
        data: { phoneNumber, code: await phoneCode(phoneNumber) },
      })
    ).ok(),
  ).toBeTruthy();
}

export async function signInPhoneUi(page: Page, phoneNumber: string) {
  await page.goto('/login');
  await page.getByPlaceholder('9123456789').fill(phoneNumber.replace(/^\+91/, ''));
  await page.getByRole('button', { name: 'Get OTP', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'OTP digit 1', exact: true })
    .fill(await phoneCode(phoneNumber));
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
}

export async function emailCode(context: BrowserContext, email: string) {
  const response = await context.request.get(
    `${providerUrl}/emails?to=${encodeURIComponent(email)}`,
  );
  expect(response.ok()).toBeTruthy();
  const messages: unknown = await response.json();
  if (!Array.isArray(messages)) throw new Error('Provider mailbox returned invalid messages');
  const last: unknown = messages.at(-1);
  if (!last || typeof last !== 'object' || !('html' in last) || typeof last.html !== 'string')
    throw new Error('Synthetic email OTP was not delivered to provider mailbox');
  const code = last.html.match(/>\s*(\d{6})\s*</)?.[1];
  if (!code) throw new Error('Synthetic email did not contain an OTP');
  return code;
}

export async function removeSyntheticUserByPhone(phoneNumber: string) {
  await assertTestDb();
  await db.delete(schema.user).where(eq(schema.user.phoneNumber, phoneNumber));
}
