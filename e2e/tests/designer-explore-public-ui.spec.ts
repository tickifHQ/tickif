import '../lib/environment';
import { randomInt, randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { db, eq, schema } from '@repo/db';
import { assertTestDb, makeDesigner, makeOrganization, makeUser } from '@repo/db/testing';
import { signInPhone } from '../lib/auth';
import { apiUrl, webUrl } from '../lib/environment';
import { makePublicPortfolio } from '../lib/public-portfolio';

async function openMobileNavigation(page: Page) {
  const trigger = page.getByRole('button', { name: 'Open navigation' });
  await trigger.focus();
  await trigger.press('Enter');
}

test('designer workspace opens discovery via Explore Tickif and empty public review sections stay hidden', async ({
  page,
  context,
}) => {
  await assertTestDb();
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const suffix = randomUUID();
  const user = await makeUser({
    name: 'Explore Studio Owner',
    email: `explore-${suffix}@example.test`,
    phoneNumber: `+9193${randomInt(10_000_000, 100_000_000)}`,
    phoneNumberVerified: true,
    role: 'designer',
    status: 'active',
  });
  const organization = await makeOrganization({ name: `Explore Studio ${suffix.slice(0, 4)}` });

  try {
    const profile = await makeDesigner({
      userId: user.id,
      orgId: organization.id,
      displayName: organization.name,
      slug: `explore-${suffix}`,
      status: 'active',
      bio: 'A synthetic studio used to verify public browsing.',
      logoImageId: `originals/logos/explore-${suffix}/logo.png`,
    });
    await db.insert(schema.member).values({
      id: randomUUID(),
      organizationId: organization.id,
      userId: user.id,
      role: 'owner',
      createdAt: new Date(),
    });
    await makePublicPortfolio({ profileId: profile.id, portfolioSlug: profile.slug });

    await signInPhone(context, user.phoneNumber);
    const select = await context.request.put(`${apiUrl}/api/orgs/context`, {
      headers: { origin: webUrl },
      data: { kind: 'organization', organizationId: organization.id },
    });
    expect(select.status()).toBe(200);

    await page.goto('/designer/dashboard');
    const explore = page.getByRole('link', { name: 'Explore Tickif' });
    await expect(explore).toBeVisible();
    await expect(explore.locator('img')).toHaveAttribute('src', '/icon.svg');
    await expect(explore.locator('svg.lucide-external-link')).toBeVisible();
    expect(await explore.evaluate((link) => link.previousElementSibling?.textContent?.trim())).toBe(
      'Contact support',
    );
    const support = explore.locator('xpath=preceding-sibling::a[1]');
    await expect(support).toHaveAttribute('href', 'https://wa.me/919994645911');
    await expect(support).toHaveAttribute('target', '_blank');
    await expect(support).toHaveAttribute('rel', 'noopener noreferrer');
    await explore.click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: /Inspire from homes/i })).toBeVisible();

    await page.goto('/designer/dashboard');
    const brand = page.getByRole('link', { name: 'Tickif', exact: true });
    await expect(brand).toHaveAttribute('href', '/designer/dashboard');
    await brand.click();
    await expect(page).toHaveURL('/designer/dashboard');

    await page.goto(`/d/${profile.slug}`);
    await page.waitForLoadState('networkidle');
    await expect(
      page.getByRole('heading', { name: organization.name, exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'What it’s like to work with us.' }),
    ).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Tickif community reviews' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /Selected projects/i })).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/designer/dashboard');
    await openMobileNavigation(page);
    const mobileExplore = page
      .getByRole('dialog', { name: 'Designer navigation' })
      .getByRole('link', { name: 'Explore Tickif' });
    await expect(mobileExplore).toBeVisible();
    await expect(mobileExplore.locator('img')).toHaveAttribute('src', '/icon.svg');
    await expect(mobileExplore.locator('svg.lucide-external-link')).toBeVisible();
    expect(
      await mobileExplore.evaluate((link) => link.previousElementSibling?.textContent?.trim()),
    ).toBe('Contact support');
    const mobileSupport = mobileExplore.locator('xpath=preceding-sibling::a[1]');
    await expect(mobileSupport).toHaveAttribute('href', 'https://wa.me/919994645911');
    await expect(mobileSupport).toHaveAttribute('target', '_blank');
    await expect(mobileSupport).toHaveAttribute('rel', 'noopener noreferrer');
    await mobileExplore.click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: /Inspire from homes/i })).toBeVisible();
    expect(pageErrors).toEqual([]);
  } finally {
    await assertTestDb();
    await db.delete(schema.organization).where(eq(schema.organization.id, organization.id));
    await db.delete(schema.user).where(eq(schema.user.id, user.id));
  }
});

for (const role of ['owner', 'admin', 'billing_admin', 'member', 'viewer'] as const) {
  test(`designer ${role} can explore via CTA while brand stays in workspace`, async ({
    page,
    context,
  }) => {
    test.setTimeout(60_000);
    await assertTestDb();
    const suffix = randomUUID();
    const owner = await makeUser({
      name: 'Explore owner',
      email: `explore-owner-${suffix}@example.test`,
      phoneNumber: `+9193${randomInt(10_000_000, 100_000_000)}`,
      phoneNumberVerified: true,
      role: 'designer',
      status: 'active',
    });
    const organization = await makeOrganization({ name: `Explore ${role} ${suffix.slice(0, 4)}` });
    let actor = owner;

    try {
      const profile = await makeDesigner({
        userId: owner.id,
        orgId: organization.id,
        displayName: organization.name,
        slug: `explore-${role}-${suffix}`,
        status: 'active',
      });
      await db.insert(schema.member).values({
        id: randomUUID(),
        organizationId: organization.id,
        userId: owner.id,
        role: 'owner',
        createdAt: new Date(),
      });
      if (role !== 'owner') {
        actor = await makeUser({
          name: `Explore ${role}`,
          email: `explore-${role}-${suffix}@example.test`,
          phoneNumber: `+9193${randomInt(10_000_000, 100_000_000)}`,
          phoneNumberVerified: true,
          role: 'designer',
          status: 'active',
        });
        await db.insert(schema.member).values({
          id: randomUUID(),
          organizationId: organization.id,
          userId: actor.id,
          role,
          createdAt: new Date(),
        });
        await db.insert(schema.teamMember).values({
          id: randomUUID(),
          teamId: profile.teamId,
          userId: actor.id,
          createdAt: new Date(),
        });
      }
      await signInPhone(context, actor.phoneNumber);
      const select = await context.request.put(`${apiUrl}/api/orgs/context`, {
        headers: { origin: webUrl },
        data: { kind: 'organization', organizationId: organization.id },
      });
      expect(select.status()).toBe(200);

      await page.goto('/designer/dashboard');
      await expect(page.getByRole('link', { name: 'Explore Tickif' })).toBeVisible();
      await page.getByRole('link', { name: 'Explore Tickif' }).click();
      await expect(page).toHaveURL('/');
      await expect(page.getByRole('heading', { name: /Inspire from homes/i })).toBeVisible();

      await page.goto('/designer/dashboard');
      const brand = page.getByRole('link', { name: 'Tickif', exact: true });
      await expect(brand).toHaveAttribute('href', '/designer/dashboard');
      await brand.click();
      await expect(page).toHaveURL('/designer/dashboard');

      if (role === 'member' || role === 'viewer') {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto('/designer/dashboard');
        await openMobileNavigation(page);
        const drawer = page.getByRole('dialog', { name: 'Designer navigation' });
        await expect(drawer.getByRole('link', { name: 'Explore Tickif' })).toBeVisible();
        await drawer.getByRole('link', { name: 'Explore Tickif' }).click();
        await expect(page).toHaveURL('/');
        await expect(page.getByRole('heading', { name: /Inspire from homes/i })).toBeVisible();

        await page.goto('/designer/dashboard');
        await openMobileNavigation(page);
        const mobileBrand = page
          .getByRole('dialog', { name: 'Designer navigation' })
          .getByRole('link', { name: 'Tickif', exact: true });
        await expect(mobileBrand).toHaveAttribute('href', '/designer/dashboard');
        await mobileBrand.click();
        await expect(page).toHaveURL('/designer/dashboard');
      }
    } finally {
      await assertTestDb();
      await db.delete(schema.organization).where(eq(schema.organization.id, organization.id));
      if (actor.id !== owner.id) await db.delete(schema.user).where(eq(schema.user.id, actor.id));
      await db.delete(schema.user).where(eq(schema.user.id, owner.id));
    }
  });
}
