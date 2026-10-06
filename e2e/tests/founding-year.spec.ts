import { randomInt, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { onboardDesignerResponseSchema } from '@repo/contracts';
import { db, eq, schema } from '@repo/db';
import { assertTestDb, makeUser } from '@repo/db/testing';
import { signInPhone } from '../lib/auth';
import { apiUrl, webUrl } from '../lib/environment';

test.use({ video: 'on' });

test('older founding year resumes in onboarding and persists through profile editing', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(150_000);
  await assertTestDb();
  const suffix = randomUUID();
  const user = await makeUser({
    name: 'Established Studio Owner',
    email: `founded-${suffix}@example.test`,
    phoneNumber: `+9193${randomInt(10_000_000, 99_999_999)}`,
    phoneNumberVerified: true,
    role: 'visitor',
    status: 'pending',
  });
  let orgId: string | undefined;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await signInPhone(context, user.phoneNumber);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/designer/onboarding');
    await page.getByRole('button', { name: /Interior company/i }).click();
    await page.getByLabel(/^Company name/).fill(`Established Studio ${suffix}`);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Skip to Next step', exact: true }).click();
    const founded = page.getByLabel('Founded', { exact: true });
    await founded.fill('');
    await expect
      .poll(async () => {
        const response = await context.request.get(`${apiUrl}/api/profiles/me/onboarding-draft`);
        return (await response.json()).draft?.fields?.foundedYear;
      })
      .toBe('');
    await page.reload();
    await expect(founded).toHaveValue('');
    await founded.fill('1995');
    await expect
      .poll(async () => {
        const response = await context.request.get(`${apiUrl}/api/profiles/me/onboarding-draft`);
        return (await response.json()).draft?.fields?.foundedYear;
      })
      .toBe('1995');
    await page.reload();
    await expect(founded).toHaveValue('1995');
    await page.screenshot({
      path: testInfo.outputPath('older-founding-year-desktop.png'),
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await founded.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath('older-founding-year-mobile.png'),
      animations: 'disabled',
    });
    await founded.fill('2100');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(founded).toHaveAttribute('aria-invalid', 'true');
    await page.screenshot({
      path: testInfo.outputPath('future-founding-year-error-mobile.png'),
      animations: 'disabled',
    });
    await founded.fill('1995');
    const submission = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().endsWith('/api/profiles/me'),
    );
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const onboarded = onboardDesignerResponseSchema.parse(await (await submission).json());
    orgId = onboarded.organization.id;
    await expect(page.getByText(/your workspace is ready/i)).toBeVisible();
    await page.goto('/designer/profile');
    await expect(page.getByLabel('Founded year')).toHaveValue('1995');
    await page.getByLabel('Founded year').fill('1985');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByText('Profile saved.', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Founded year')).toHaveValue('1985');
    await page.getByLabel('Founded year').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath('older-founding-year-editor-mobile.png'),
      animations: 'disabled',
    });
    const owner = await context.request.get(`${apiUrl}/api/profiles/me`);
    const saved = await owner.json();
    expect(saved.foundedYear).toBe(1985);
    expect(saved.yearsExperience).toBe(new Date().getUTCFullYear() - 1985);
    const future = await context.request.patch(`${apiUrl}/api/profiles/me`, {
      headers: { origin: webUrl },
      data: { foundedYear: 2100 },
    });
    expect(future.status()).toBe(422);
    expect(
      (await (await context.request.get(`${apiUrl}/api/profiles/me`)).json()).foundedYear,
    ).toBe(1985);
    expect(errors).toEqual([]);
  } finally {
    await assertTestDb();
    if (orgId) await db.delete(schema.organization).where(eq(schema.organization.id, orgId));
    await db.delete(schema.user).where(eq(schema.user.id, user.id));
  }
});
