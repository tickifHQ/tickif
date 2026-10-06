import { randomInt, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { db, eq, schema } from '@repo/db';
import { assertTestDb, makeUser } from '@repo/db/testing';
import {
  currentProfileResponseSchema,
  onboardDesignerResponseSchema,
  onboardingDraftGetResponseSchema,
} from '@repo/contracts';
import { signInPhone } from '../lib/auth';
import { apiUrl } from '../lib/environment';

test.use({ video: 'on' });

for (const width of [1440, 390]) {
  test(`company team-size ranges resume and persist through profile editing at ${width}px`, async ({
    page,
    context,
  }, testInfo) => {
    test.setTimeout(120_000);
    await assertTestDb();
    const suffix = randomUUID();
    const user = await makeUser({
      id: `team-size-${suffix}`,
      name: 'Team Size Owner',
      email: `team-size-${suffix}@example.test`,
      phoneNumber: `+9193${randomInt(10_000_000, 99_999_999)}`,
      phoneNumberVerified: true,
      role: 'visitor',
      status: 'pending',
    });
    let orgId: string | undefined;
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    try {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await signInPhone(context, user.phoneNumber);
      await page.goto('/designer/onboarding');
      await page.getByRole('button', { name: /Interior company/i }).click();
      await page.getByLabel(/^Company name/).fill('Large Team Studio');
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await page.getByRole('button', { name: 'Skip to Next step', exact: true }).click();
      await page.getByLabel('Team size', { exact: true }).click();
      for (const range of ['26-50', '51-99', '100+']) {
        await expect(page.getByRole('menuitem', { name: range, exact: true })).toBeVisible();
      }
      await expect(page.getByRole('menuitem', { name: '50+', exact: true })).toHaveCount(0);
      await page.screenshot({
        path: testInfo.outputPath(`team-size-options-${width}.png`),
        animations: 'disabled',
      });
      await page.getByRole('menuitem', { name: '51-99', exact: true }).click();
      await expect
        .poll(async () => {
          const response = await context.request.get(`${apiUrl}/api/profiles/me/onboarding-draft`);
          return onboardingDraftGetResponseSchema.parse(await response.json()).draft?.fields
            .teamSize;
        })
        .toBe('51-99');
      await page.reload();
      await expect(page.getByLabel('Team size', { exact: true })).toHaveText('51-99');
      await page.getByLabel('Team size', { exact: true }).click();
      if (width === 1440) {
        await page.getByRole('menuitem', { name: '100+', exact: true }).focus();
        await page.keyboard.press('Enter');
      } else {
        await page.getByRole('menuitem', { name: '100+', exact: true }).click();
      }
      await expect
        .poll(async () => {
          const response = await context.request.get(`${apiUrl}/api/profiles/me/onboarding-draft`);
          return onboardingDraftGetResponseSchema.parse(await response.json()).draft?.fields
            .teamSize;
        })
        .toBe('100+');
      await page.reload();
      await expect(page.getByLabel('Team size', { exact: true })).toHaveText('100+');
      await page.screenshot({
        path: testInfo.outputPath(`team-size-resumed-${width}.png`),
        animations: 'disabled',
      });
      const onboardResponse = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' && response.url().endsWith('/api/profiles/me'),
      );
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      const onboarded = onboardDesignerResponseSchema.parse(await (await onboardResponse).json());
      orgId = onboarded.organization.id;
      expect(
        currentProfileResponseSchema.parse(
          await (await context.request.get(`${apiUrl}/api/profiles/me`)).json(),
        ).staffCount,
      ).toBe(100);
      await page.goto('/designer/profile');
      await expect(page.getByLabel('Staff count', { exact: true })).toHaveValue('100');
      await page.getByLabel('Staff count', { exact: true }).fill('150');
      await page.getByRole('button', { name: 'Save changes', exact: true }).click();
      await expect
        .poll(
          async () =>
            currentProfileResponseSchema.parse(
              await (await context.request.get(`${apiUrl}/api/profiles/me`)).json(),
            ).staffCount,
        )
        .toBe(150);
      await page.reload();
      await expect(page.getByLabel('Staff count', { exact: true })).toHaveValue('150');
      await page.getByLabel('Staff count', { exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({
        path: testInfo.outputPath(`team-size-saved-profile-${width}.png`),
        animations: 'disabled',
      });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      expect(pageErrors).toEqual([]);
    } finally {
      await assertTestDb();
      if (orgId) await db.delete(schema.organization).where(eq(schema.organization.id, orgId));
      await db.delete(schema.user).where(eq(schema.user.id, user.id));
    }
  });
}
