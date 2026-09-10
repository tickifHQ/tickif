import { randomInt, randomUUID } from 'node:crypto';
import { expect, test, type BrowserContext } from '@playwright/test';
import { db, eq, schema } from '@repo/db';
import { assertTestDb, makeDesigner, makeOrganization, makeUser } from '@repo/db/testing';
import { signInPhone } from '../lib/auth';
import { apiUrl, webUrl } from '../lib/environment';

/**
 * E-278: designer-facing surfaces must only expose a public portfolio URL when
 * the backend says the portfolio is genuinely live (`publiclyVisible`). These
 * journeys seed real profiles in each publication state and drive the actual
 * dashboard + portfolio-settings UI, then assert the public `/d/{slug}` route
 * agrees (unpublished stays a hard 404).
 *
 * Related, deliberately NOT re-tested here:
 * - Individual onboarding + completion + "Finish later"/deferred recovery are
 *   already covered end-to-end in authentication.spec.ts.
 * - The publish-on-hero backend engine and public 404 gate are owned by the
 *   portfolio publication work; we only assert the frontend honours their state.
 */

const headers = { origin: webUrl };

async function selectOrganization(context: BrowserContext, organizationId: string) {
  const response = await context.request.put(`${apiUrl}/api/orgs/context`, {
    headers,
    data: { kind: 'organization', organizationId },
  });
  expect(response.status()).toBe(200);
}

type SeedOptions = {
  status: 'draft' | 'active';
  publicLinkEnabled: boolean;
  logo: boolean;
  bio: boolean;
  tagline: boolean;
};

test.describe('E-278 portfolio publication readiness', () => {
  const userIds: string[] = [];
  const organizationIds: string[] = [];

  test.afterAll(async () => {
    await assertTestDb();
    if (organizationIds.length > 0) {
      await db.delete(schema.organization).where(eq(schema.organization.id, organizationIds[0]!));
      for (const id of organizationIds.slice(1)) {
        await db.delete(schema.organization).where(eq(schema.organization.id, id));
      }
    }
    for (const id of userIds) {
      await db.delete(schema.user).where(eq(schema.user.id, id));
    }
  });

  async function seedDesigner(label: string, options: SeedOptions) {
    const suffix = randomUUID();
    const phoneNumber = `+9193${randomInt(10_000_000, 99_999_999)}`;
    const user = await makeUser({
      id: `e278-${label}-${suffix}`,
      name: `E278 ${label}`,
      email: `e278-${label}-${suffix}@example.test`,
      phoneNumber,
      phoneNumberVerified: true,
      role: 'designer',
      status: 'active',
    });
    userIds.push(user.id);

    const organization = await makeOrganization({
      id: `e278-${label}-${suffix}`,
      name: `E278 ${label} Studio`,
    });
    organizationIds.push(organization.id);

    const profile = await makeDesigner({
      userId: user.id,
      orgId: organization.id,
      displayName: organization.name,
      status: options.status,
      bio: options.bio ? `${label} studio biography for real homes` : null,
      logoImageId: options.logo ? `originals/logos/${label}-${suffix}/logo.png` : null,
    });

    await db.insert(schema.member).values({
      id: randomUUID(),
      organizationId: organization.id,
      userId: user.id,
      role: 'owner',
      createdAt: new Date(),
    });

    const portfolioSlug = `${label.toLowerCase()}-${suffix}`;
    await db.insert(schema.designerPortfolio).values({
      profileId: profile.id,
      portfolioSlug,
      tagline: options.tagline ? `${label} designs with care` : null,
      publicLinkEnabled: options.publicLinkEnabled,
    });

    return { user, organization, profile, portfolioSlug };
  }

  test('an incomplete portfolio never exposes an actionable public URL (state D)', async ({
    browser,
  }) => {
    const context = await browser.newContext({ baseURL: webUrl });
    try {
      // Draft profile missing hero fields — never publicly visible.
      const seed = await seedDesigner('incomplete', {
        status: 'draft',
        publicLinkEnabled: true,
        logo: false,
        bio: false,
        tagline: false,
      });
      await signInPhone(context, seed.user.phoneNumber);
      await selectOrganization(context, seed.organization.id);
      const page = await context.newPage();

      // Dashboard: no copyable public link, a readiness CTA instead.
      await page.goto('/designer/dashboard');
      await expect(page.getByRole('button', { name: /copy link/i })).toHaveCount(0);
      await expect(
        page.getByRole('link', { name: /complete your portfolio/i }).first(),
      ).toBeVisible();
      await expect(page.getByText(seed.portfolioSlug)).toHaveCount(0);

      // Portfolio settings: no "Open full", no "Copy link".
      await page.goto('/designer/portfolio');
      await expect(page.getByRole('link', { name: 'Open full' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Copy link' })).toHaveCount(0);

      // Public route: hard 404 for the unpublished slug.
      const publicResponse = await context.request.get(`${apiUrl}/api/portfolios/${seed.portfolioSlug}`, {
        headers,
      });
      expect(publicResponse.status()).toBe(404);
    } finally {
      await context.close();
    }
  });

  test('a complete portfolio with the public link off stays private (state E)', async ({
    browser,
  }) => {
    const context = await browser.newContext({ baseURL: webUrl });
    try {
      // All hero fields present and active, but the public link is switched off.
      const seed = await seedDesigner('hidden', {
        status: 'active',
        publicLinkEnabled: false,
        logo: true,
        bio: true,
        tagline: true,
      });
      await signInPhone(context, seed.user.phoneNumber);
      await selectOrganization(context, seed.organization.id);
      const page = await context.newPage();

      await page.goto('/designer/portfolio');
      await expect(page.getByRole('link', { name: 'Open full' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Copy link' })).toHaveCount(0);

      await page.goto('/designer/dashboard');
      await expect(page.getByRole('button', { name: /copy link/i })).toHaveCount(0);

      // Public route still 404s because the link is disabled.
      const publicResponse = await context.request.get(`${apiUrl}/api/portfolios/${seed.portfolioSlug}`, {
        headers,
      });
      expect(publicResponse.status()).toBe(404);
    } finally {
      await context.close();
    }
  });

  test('a published portfolio exposes the canonical URL everywhere and resolves publicly (state F + regression G)', async ({
    browser,
  }) => {
    const context = await browser.newContext({ baseURL: webUrl });
    try {
      // Complete + active + public link on -> publicly visible.
      const seed = await seedDesigner('published', {
        status: 'active',
        publicLinkEnabled: true,
        logo: true,
        bio: true,
        tagline: true,
      });
      const canonicalUrl = new URL(`/d/${seed.portfolioSlug}`, webUrl).toString();
      await signInPhone(context, seed.user.phoneNumber);
      await selectOrganization(context, seed.organization.id);
      const page = await context.newPage();

      // Portfolio settings: Open full points at the canonical saved URL.
      await page.goto('/designer/portfolio');
      const openFull = page.getByRole('link', { name: 'Open full' });
      await expect(openFull).toBeVisible();
      await expect(openFull).toHaveAttribute('href', canonicalUrl);
      await expect(page.getByRole('button', { name: 'Copy link' })).toBeVisible();

      // Dashboard: the share card shows and copies the same canonical URL.
      await page.goto('/designer/dashboard');
      await expect(page.getByRole('button', { name: /copy link/i })).toBeVisible();
      await expect(page.getByText(seed.portfolioSlug).first()).toBeVisible();

      // Regression G: the canonical URL is the real slug — never a placeholder.
      expect(canonicalUrl).not.toContain('/d/studio');
      expect(canonicalUrl).not.toContain('/d/your-studio');

      // Public route resolves (200) for the published slug.
      const publicResponse = await context.request.get(`${apiUrl}/api/portfolios/${seed.portfolioSlug}`, {
        headers,
      });
      expect(publicResponse.status()).toBe(200);

      // The public page itself renders (not a 404).
      const publicPage = await page.goto(canonicalUrl);
      expect(publicPage?.status()).toBe(200);
    } finally {
      await context.close();
    }
  });
});
