import { randomInt, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { db, eq, schema } from '@repo/db';
import { assertTestDb, makeUser } from '@repo/db/testing';
import { onboardDesignerResponseSchema } from '@repo/contracts';
import { signInPhone } from '../lib/auth';
import { apiUrl, webUrl } from '../lib/environment';

/**
 * E-278: end-to-end coverage for COMPANY/organization designer onboarding.
 *
 * Individual onboarding + "Finish later"/deferred recovery are already covered
 * by authentication.spec.ts; this spec adds the company journey Linear E-278
 * explicitly requires. It drives the real multi-step company flow
 * (entity -> details -> presence -> services -> submit), then confirms the
 * account is a usable designer that reaches the dashboard (never Access denied)
 * and can proceed to Portfolio Settings to finish the public-profile hero.
 */

test('company designer completes onboarding and can proceed to portfolio settings', async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  await assertTestDb();

  const suffix = randomUUID();
  const phoneNumber = `+9193${randomInt(10_000_000, 99_999_999)}`;
  const context = await browser.newContext({ baseURL: webUrl });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  let orgId: string | undefined;
  let userId: string | undefined;
  try {
    // A verified visitor who has not yet onboarded as a designer.
    const user = await makeUser({
      id: `e278-company-${suffix}`,
      name: `E278 Company ${suffix}`,
      email: `e278-company-${suffix}@example.test`,
      phoneNumber,
      phoneNumberVerified: true,
      role: 'visitor',
      status: 'pending',
    });
    userId = user.id;

    await signInPhone(context, phoneNumber);
    await page.goto('/designer/onboarding');

    // Step 1 (entity): choose the company/firm path.
    await page.getByRole('button', { name: /Interior company/i }).click();

    // Step 2 (details): company name is the only required field.
    await page.getByLabel('Company name', { exact: true }).fill(`Journey Firm ${suffix}`);
    await page.getByLabel('Address', { exact: true }).fill('Indiranagar, Bengaluru');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();

    // Step 3 (presence): optional links — advance with defaults.
    await page.getByRole('button', { name: 'Continue', exact: true }).click();

    // Step 4 (services): scope/theme/founded/team have defaults; this final
    // Continue submits the company onboarding payload.
    const onboardingResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().endsWith('/api/profiles/me'),
    );
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const onboarded = onboardDesignerResponseSchema.parse(await (await onboardingResponse).json());
    orgId = onboarded.organization.id;
    expect(onboarded.profile.entityType).toBe('company');

    // Completion step: truthful readiness messaging + a CTA into the portfolio.
    await expect(page.getByText(/your workspace is ready/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /complete your portfolio/i })).toBeVisible();

    // The onboarded visitor is now a real designer (role transition applied).
    const session = await context.request.get(
      `${apiUrl}/api/auth/get-session?disableCookieCache=true`,
    );
    expect((await session.json()).user.role).toBe('designer');

    // Reaching the dashboard must NOT hit Access denied / deferred / unauthorized.
    await page.goto('/designer/dashboard');
    await expect(page).toHaveURL(/\/designer\/dashboard$/);
    await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible();

    // The designer can proceed to Portfolio Settings to finish the public hero.
    await page.goto('/designer/portfolio');
    await expect(page).toHaveURL(/\/designer\/portfolio$/);
    await expect(page.getByPlaceholder('your-studio', { exact: true })).toBeVisible();

    await page.screenshot({
      path: testInfo.outputPath('company-onboarding-complete.png'),
      animations: 'disabled',
    });
    expect(pageErrors).toEqual([]);
  } finally {
    await assertTestDb();
    if (orgId) await db.delete(schema.organization).where(eq(schema.organization.id, orgId));
    if (userId) await db.delete(schema.user).where(eq(schema.user.id, userId));
  }
});
