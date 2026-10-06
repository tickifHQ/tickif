import { randomInt, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { db, eq, schema } from '@repo/db';
import { assertTestDb, makeDesigner, makeOrganization, makeUser } from '@repo/db/testing';
import { deleteObject, putObject } from '@repo/storage';
import { signInPhone } from '../lib/auth';
import { apiUrl, webUrl } from '../lib/environment';

test.use({ video: 'on' });

test('custom portfolio accent previews validates saves reloads and discards on desktop and mobile', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(180_000);
  await assertTestDb();
  const suffix = randomUUID();
  const user = await makeUser({
    name: 'Accent Owner',
    email: `accent-${suffix}@example.test`,
    phoneNumber: `+9193${randomInt(10_000_000, 99_999_999)}`,
    phoneNumberVerified: true,
    role: 'designer',
    status: 'active',
  });
  const organization = await makeOrganization({ name: 'Colour Studio', slug: `colour-${suffix}` });
  const profile = await makeDesigner({
    userId: user.id,
    orgId: organization.id,
    displayName: organization.name,
    entityType: 'company',
    status: 'active',
    bio: 'Homes inspired by your own colours.',
  });
  const logoKey = `originals/logos/${profile.id}/logo.png`;
  const coverKey = `originals/portfolio-covers/${profile.id}/cover.jpg`;
  const slug = `colour-${suffix}`;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await db.insert(schema.member).values({
      id: randomUUID(),
      organizationId: organization.id,
      userId: user.id,
      role: 'owner',
      createdAt: new Date(),
    });
    for (const asset of [
      { key: logoKey, file: 'email/tickif-mark.png', contentType: 'image/png' },
      { key: coverKey, file: 'home-hero/neutral-living-room.jpg', contentType: 'image/jpeg' },
    ]) {
      await putObject({
        key: asset.key,
        body: await readFile(
          resolve(import.meta.dirname, '../../apps/web/public/images', asset.file),
        ),
        contentType: asset.contentType,
      });
    }
    await db
      .update(schema.designerProfile)
      .set({ logoImageId: logoKey })
      .where(eq(schema.designerProfile.id, profile.id));
    await db.insert(schema.designerPortfolio).values({
      profileId: profile.id,
      portfolioSlug: slug,
      tagline: 'Space for colour',
      testimonialWords: 'Every detail feels like our home.',
      testimonialAuthor: 'A happy client',
      heroImageId: coverKey,
      publicLinkEnabled: true,
    });
    await signInPhone(context, user.phoneNumber);
    expect(
      (
        await context.request.put(`${apiUrl}/api/orgs/context`, {
          headers: { origin: webUrl },
          data: { kind: 'organization', organizationId: organization.id },
        })
      ).status(),
    ).toBe(200);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/designer/portfolio');
    const input = page.getByLabel('Custom accent hex');
    const preview = page.getByRole('region', { name: 'Accent colour preview' });
    const save = page.getByRole('button', { name: 'Save changes', exact: true });
    await expect(input).toHaveValue('#FF8F73');
    await input.fill('url(https://example.test)');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('button', { name: 'Use colour' })).toBeDisabled();
    await expect(preview).toHaveCSS('--primary', '#FF8F73');
    await expect(save).toBeDisabled();
    await input.fill('#123abc');
    await expect(preview).toHaveCSS('--primary', '#123ABC');
    await expect(save).toBeDisabled();
    await preview.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath('custom-accent-preview-desktop.png'),
      animations: 'disabled',
    });
    await input.press('Enter');
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await page.reload();
    await expect(input).toHaveValue('#123ABC');
    expect(
      await (await context.request.get(`${apiUrl}/api/profiles/me/portfolio`)).json(),
    ).toMatchObject({ accentColor: '#123ABC' });
    await page.goto(`/d/${slug}`);
    await expect(page.locator('main')).toHaveCSS('--primary', '#123ABC');
    await page.screenshot({
      path: testInfo.outputPath('custom-accent-public-desktop.png'),
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/designer/portfolio');
    await input.fill('#FFFFFF');
    await expect(preview.locator('span')).toHaveCSS('color', 'rgb(0, 0, 0)');
    await page.getByRole('button', { name: 'Cancel colour change' }).click();
    await expect(input).toHaveValue('#123ABC');
    await input.fill('#000000');
    await page.getByRole('button', { name: 'Use colour' }).click();
    await preview.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: testInfo.outputPath('custom-accent-preview-mobile.png'),
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Discard changes' }).click();
    await expect(input).toHaveValue('#123ABC');
    await expect(save).toBeDisabled();
    await page.reload();
    await expect(input).toHaveValue('#123ABC');
    await page.goto(`/d/${slug}`);
    await expect(page.locator('main')).toHaveCSS('--primary', '#123ABC');
    await page.screenshot({
      path: testInfo.outputPath('custom-accent-public-mobile.png'),
      animations: 'disabled',
    });
    for (const [hex, foreground] of [
      ['#FFFFFF', 'rgb(0, 0, 0)'],
      ['#000000', 'rgb(255, 255, 255)'],
    ] as const) {
      await page.goto('/designer/portfolio');
      await page.evaluate(() => document.documentElement.classList.add('dark'));
      await input.fill(hex);
      await expect(preview.locator('span')).toHaveCSS('color', foreground);
      await page.getByRole('button', { name: 'Use colour' }).click();
      await save.click();
      await expect(page.getByText('Saved', { exact: true })).toBeVisible();
      await page.goto(`/d/${slug}`);
      await expect(page.locator('main')).toHaveCSS('--primary', hex);
      await expect(page.locator('main .bg-primary').first()).toHaveCSS('color', foreground);
      const headingEmphasis = page.getByText('words', { exact: true });
      await expect(headingEmphasis).toBeVisible();
      expect(
        await headingEmphasis.evaluate((element) => {
          const style = getComputedStyle(element);
          const probe = document.createElement('span');
          probe.style.color = 'var(--foreground)';
          element.append(probe);
          const foregroundColour = getComputedStyle(probe).color;
          probe.remove();
          return style.color === foregroundColour;
        }),
      ).toBe(true);
      await headingEmphasis.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: testInfo.outputPath(
          `custom-accent-public-${hex === '#FFFFFF' ? 'light' : 'dark'}.png`,
        ),
        animations: 'disabled',
      });
    }
    expect(errors).toEqual([]);
  } finally {
    await deleteObject(logoKey);
    await deleteObject(coverKey);
    await db.delete(schema.organization).where(eq(schema.organization.id, organization.id));
    await db.delete(schema.user).where(eq(schema.user.id, user.id));
  }
});
