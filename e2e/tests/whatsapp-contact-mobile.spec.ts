import { randomInt, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { db, eq, schema } from '@repo/db';
import { makeUser } from '@repo/db/testing';
import { signInPhone, verifyWhatsappContact } from '../lib/auth';

test('WhatsApp contact dialog verifies and saves on a narrow mobile screen', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const phone = `+9198${randomInt(10_000_000, 99_999_999)}`;
  const contact = `+9197${randomInt(10_000_000, 99_999_999)}`;
  const user = await makeUser({
    email: `wa-mobile-${randomUUID()}@test.local`,
    name: 'Mobile WhatsApp',
    phoneNumber: phone,
    phoneNumberVerified: true,
    role: 'visitor',
    status: 'active',
  });
  try {
    await signInPhone(context, phone);
    await page.goto('/home/settings');
    await verifyWhatsappContact(page, contact);
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Personal settings saved.');
    await page.reload();
    await expect(page.getByLabel('WhatsApp number (optional)', { exact: true })).toHaveValue(
      contact,
    );
    await page.screenshot({ path: testInfo.outputPath('mobile-whatsapp-verified.png') });
  } finally {
    await db.delete(schema.user).where(eq(schema.user.id, user.id));
  }
});
