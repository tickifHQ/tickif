import { randomUUID } from 'node:crypto';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { db, eq, schema } from '@repo/db';
import { assertTestDb } from '@repo/db/testing';
import { apiUrl } from '../lib/environment';
import { emailCode } from '../lib/auth';

/**
 * E-298: designer onboarding progress is ACCOUNT-LEVEL. A pending designer can
 * enter partial data, leave via "Finish later", and resume the same step and
 * values later — including from a fresh browser context (same account) and after
 * a mid-onboarding refresh. On successful onboarding the draft is deleted and the
 * now-designer is never sent back into onboarding.
 */

async function signInAsPendingDesigner(page: Page, context: BrowserContext, email: string) {
  await page.goto('/login?mode=designer');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'OTP digit 1', exact: true })).toBeVisible();
  await page
    .getByRole('textbox', { name: 'OTP digit 1', exact: true })
    .fill(await emailCode(context, email));
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  await expect(page).toHaveURL(/\/designer\/onboarding/);
}

test('designer onboarding progress resumes across leave/re-entry, then completes and clears the draft', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  const email = `resume-${randomUUID()}@test.local`;
  const website = 'https://resume-studio.example';
  const displayName = 'Resume Studio';
  let orgId: string | undefined;

  try {
    // 1-2. Sign in as a fresh pending designer and enter onboarding.
    await signInAsPendingDesigner(page, context, email);

    // 3. Select entity, 4. enter meaningful data (details), 5. advance to presence.
    await page.getByRole('button', { name: /Just me/ }).click();
    await page.getByLabel('Display name', { exact: true }).fill(displayName);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();

    // On the presence step now — enter a website (a presence-step field).
    const websiteInput = page.getByLabel('Website', { exact: true });
    await expect(websiteInput).toBeVisible();
    await websiteInput.fill(website);

    // Wait until the draft is actually persisted server-side before leaving, so
    // the assertion is deterministic (autosave debounce + explicit flush).
    await expect
      .poll(
        async () => {
          const res = await context.request.get(`${apiUrl}/api/profiles/me/onboarding-draft`);
          const body = await res.json();
          return body?.draft?.fields?.websiteUrl ?? null;
        },
        { timeout: 10_000 },
      )
      .toBe(website);

    // 6. Finish later → deferred landing.
    await page.getByRole('button', { name: 'Finish later', exact: true }).click();
    await expect(page).toHaveURL(/\/designer\/onboarding\/deferred$/);

    // 7. Leave onboarding entirely (public feed), then 8. re-enter onboarding.
    await page.goto('/');
    await page.goto('/designer/onboarding');

    // 9. Resumes on the PRESENCE step (website field visible, not the entity picker).
    const resumedWebsite = page.getByLabel('Website', { exact: true });
    await expect(resumedWebsite).toBeVisible();
    // 10. Previously entered value is restored.
    await expect(resumedWebsite).toHaveValue(website);
    // The entity picker is not shown (we're past step 1).
    await expect(page.getByRole('button', { name: /Just me/ })).toHaveCount(0);

    // 11-12. Continue and complete onboarding.
    const onboardingResponse = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/api/profiles/me'),
    );
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const onboarded = await (await onboardingResponse).json();
    orgId = onboarded.organization.id;
    await expect(page.getByText(/your workspace is ready/i)).toBeVisible();

    // 13. Draft is deleted after successful onboarding (GET returns null).
    await expect
      .poll(
        async () => {
          const res = await context.request.get(`${apiUrl}/api/profiles/me/onboarding-draft`);
          return (await res.json())?.draft;
        },
        { timeout: 10_000 },
      )
      .toBeNull();

    // 14. The completed designer is NOT sent back into onboarding.
    await page.goto('/designer/onboarding');
    await expect(page).not.toHaveURL(/\/designer\/onboarding$/);

    // A pending-gated save now fails (403) — a completed designer cannot re-create a draft.
    const putAfter = await context.request.put(`${apiUrl}/api/profiles/me/onboarding-draft`, {
      data: { step: 'details', fields: { userName: 'should not persist' } },
    });
    expect(putAfter.status()).toBe(403);
  } finally {
    await assertTestDb();
    if (orgId) await db.delete(schema.organization).where(eq(schema.organization.id, orgId));
    await db.delete(schema.user).where(eq(schema.user.email, email));
  }
});

test('same account resumes the draft in a FRESH browser context (account-level, not browser-local)', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const email = `resume-fresh-${randomUUID()}@test.local`;
  const website = 'https://cross-device.example';

  // First context: sign in, enter data, advance, finish later.
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  try {
    await signInAsPendingDesigner(pageA, ctxA, email);
    await pageA.getByRole('button', { name: /Just me/ }).click();
    await pageA.getByLabel('Display name', { exact: true }).fill('Cross Device Studio');
    await pageA.getByRole('button', { name: 'Continue', exact: true }).click();
    await pageA.getByLabel('Website', { exact: true }).fill(website);
    await expect
      .poll(
        async () => {
          const res = await ctxA.request.get(`${apiUrl}/api/profiles/me/onboarding-draft`);
          return (await res.json())?.draft?.fields?.websiteUrl ?? null;
        },
        { timeout: 10_000 },
      )
      .toBe(website);
    await pageA.getByRole('button', { name: 'Finish later', exact: true }).click();
    await expect(pageA).toHaveURL(/\/designer\/onboarding\/deferred$/);

    // Second, FRESH context — same account signs in anew (no shared storage).
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    try {
      await signInAsPendingDesigner(pageB, ctxB, email);
      await pageB.goto('/designer/onboarding');
      const websiteB = pageB.getByLabel('Website', { exact: true });
      await expect(websiteB).toBeVisible();
      await expect(websiteB).toHaveValue(website); // resumed from the server draft
    } finally {
      await ctxB.close();
    }
  } finally {
    await ctxA.close();
    await assertTestDb();
    await db.delete(schema.user).where(eq(schema.user.email, email));
  }
});

test('a refresh mid-onboarding preserves progress', async ({ page, context }) => {
  test.setTimeout(120_000);
  const email = `resume-refresh-${randomUUID()}@test.local`;
  const website = 'https://refresh-studio.example';
  try {
    await signInAsPendingDesigner(page, context, email);
    await page.getByRole('button', { name: /Just me/ }).click();
    await page.getByLabel('Display name', { exact: true }).fill('Refresh Studio');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByLabel('Website', { exact: true }).fill(website);

    await expect
      .poll(
        async () => {
          const res = await context.request.get(`${apiUrl}/api/profiles/me/onboarding-draft`);
          return (await res.json())?.draft?.fields?.websiteUrl ?? null;
        },
        { timeout: 10_000 },
      )
      .toBe(website);

    await page.reload();

    const websiteAfter = page.getByLabel('Website', { exact: true });
    await expect(websiteAfter).toBeVisible();
    await expect(websiteAfter).toHaveValue(website);
  } finally {
    await assertTestDb();
    await db.delete(schema.user).where(eq(schema.user.email, email));
  }
});
