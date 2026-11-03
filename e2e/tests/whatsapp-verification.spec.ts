import { randomInt, randomUUID } from 'node:crypto';
import { expect, test, type Page, type BrowserContext } from '@playwright/test';
import { db, eq, schema } from '@repo/db';
import { makeUser } from '@repo/db/testing';
import { signInPhone, emailCode, verifyWhatsappContact } from '../lib/auth';
import { apiUrl } from '../lib/environment';

test('individual onboarding cannot skip WhatsApp verification for an entered contact', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  const phone = `+9193${randomInt(10_000_000, 99_999_999)}`;
  const contact = `+9192${randomInt(10_000_000, 99_999_999)}`;
  const user = await makeUser({
    email: `wa-individual-${randomUUID()}@test.local`,
    name: 'Individual OTP',
    phoneNumber: phone,
    phoneNumberVerified: true,
    role: 'visitor',
    status: 'pending',
  });
  let orgId: string | undefined;
  try {
    await signInPhone(context, phone);
    await page.goto('/designer/onboarding');
    await page.getByRole('button', { name: /Just me/i }).click();
    await page.getByLabel(/Display name/).fill('Individual Studio');
    await page.getByRole('textbox', { name: 'Phone number', exact: true }).fill(contact.slice(3));
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Finish later', exact: true }).click();
    await expect(
      page.getByText('Verify this WhatsApp number before continuing.', { exact: true }),
    ).toBeVisible();
    const bypass = await context.request.post(apiUrl + '/api/profiles/me', {
      data: {
        entityType: 'individual',
        userName: 'Individual Studio',
        scopeIds: [],
        themeIds: [],
        phone: contact,
      },
    });
    expect(bypass.status()).toBe(422);
    await verifyWhatsappContact(page, contact);
    const finished = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/api/profiles/me'),
    );
    await page.getByRole('button', { name: 'Finish later', exact: true }).click();
    const response = await finished;
    expect(response.ok()).toBeTruthy();
    orgId = (await response.json()).organization.id;
    const [profile] = await db
      .select()
      .from(schema.designerProfile)
      .where(eq(schema.designerProfile.userId, user.id));
    expect(profile!.phone).toBe(contact);
  } finally {
    if (orgId) await db.delete(schema.organization).where(eq(schema.organization.id, orgId));
    await db.delete(schema.user).where(eq(schema.user.id, user.id));
  }
});

async function verifyContact(page: Page, context: BrowserContext, phone: string) {
  await page.getByRole('button', { name: 'Verify WhatsApp number', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'OTP digit 1', exact: true })).toBeVisible();
  const code = await emailCode(context, phone.replace('+', '') + '@whatsapp.test');
  await page.getByRole('textbox', { name: 'OTP digit 1', exact: true }).fill(code);
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('WhatsApp verified');
}

test('personal WhatsApp changes require OTP and leave the login number unchanged', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120_000);
  const phone = `+9198${randomInt(10_000_000, 99_999_999)}`;
  const contact = `+9197${randomInt(10_000_000, 99_999_999)}`;
  const user = await makeUser({
    email: `wa-${randomUUID()}@test.local`,
    name: 'WhatsApp Test',
    phoneNumber: phone,
    phoneNumberVerified: true,
    role: 'visitor',
    status: 'active',
  });
  try {
    await signInPhone(context, phone);
    await page.goto('/home/settings');
    await page.getByLabel('WhatsApp number (optional)', { exact: true }).fill(contact);
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(
      page.getByText('Verify this WhatsApp number before saving.', { exact: true }),
    ).toBeVisible();
    await verifyContact(page, context, contact);
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Personal settings saved.');
    await page.reload();
    await expect(page.getByLabel('WhatsApp number (optional)', { exact: true })).toHaveValue(
      contact,
    );
    const [account] = await db.select().from(schema.user).where(eq(schema.user.id, user.id));
    expect(account!.phoneNumber).toBe(phone);
    await page.screenshot({ path: testInfo.outputPath('personal-whatsapp-verified.png') });
  } finally {
    await db.delete(schema.user).where(eq(schema.user.id, user.id));
  }
});

test('company onboarding and profile contact replacement both verify WhatsApp', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(180_000);
  const phone = `+9196${randomInt(10_000_000, 99_999_999)}`;
  const contact = `+9195${randomInt(10_000_000, 99_999_999)}`;
  const user = await makeUser({
    email: `wa-designer-${randomUUID()}@test.local`,
    name: 'WhatsApp Designer',
    phoneNumber: phone,
    phoneNumberVerified: true,
    role: 'visitor',
    status: 'pending',
  });
  let orgId: string | undefined;
  try {
    await signInPhone(context, phone);
    await page.goto('/designer/onboarding');
    await page.getByRole('button', { name: /Interior company/i }).click();
    await page.getByLabel(/^Company name/).fill('WhatsApp Studio');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('textbox', { name: 'Phone number', exact: true }).fill(contact.slice(3));
    await verifyContact(page, context, contact);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const onboarded = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/api/profiles/me'),
    );
    await page.getByRole('button', { name: 'Skip to Next step', exact: true }).click();
    const response = await onboarded;
    expect(response.ok()).toBeTruthy();
    orgId = (await response.json()).organization.id;
    await page.goto('/designer/profile');
    const replacement = `+9194${randomInt(10_000_000, 99_999_999)}`;
    await page.getByLabel('WhatsApp / phone', { exact: true }).fill(replacement.slice(3));
    const bypass = await context.request.patch(apiUrl + '/api/profiles/me', {
      data: { phone: replacement },
    });
    expect(bypass.status()).toBe(422);
    await verifyContact(page, context, replacement);
    const save = page.waitForResponse(
      (r) => r.request().method() === 'PATCH' && r.url().endsWith('/api/profiles/me'),
    );
    await page.getByRole('button', { name: /Save changes/i }).click();
    expect((await save).ok()).toBeTruthy();
    const saved = await context.request.get(`${apiUrl}/api/profiles/me`);
    expect((await saved.json()).phone).toBe(replacement);
    await page.screenshot({ path: testInfo.outputPath('studio-whatsapp-verified.png') });
  } finally {
    if (orgId) await db.delete(schema.organization).where(eq(schema.organization.id, orgId));
    await db.delete(schema.user).where(eq(schema.user.id, user.id));
  }
});
