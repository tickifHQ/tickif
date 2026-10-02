import '../lib/environment';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { db, eq, schema } from '@repo/db';
import {
  assertTestDb,
  makeDesigner,
  makeOrganization,
  makeProject,
  makeProjectImage,
  makeUser,
} from '@repo/db/testing';
import { deleteObject, putObject } from '@repo/storage';
import { webUrl } from '../lib/environment';
import { makePublicPortfolio } from '../lib/public-portfolio';

test.use({ video: 'on', viewport: { width: 1280, height: 800 } });

test('anonymous social cards cover public routes and disappear immediately when unpublished', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(240_000);
  await assertTestDb();
  const suffix = randomUUID();
  const owner = await makeUser({ role: 'designer', status: 'active' });
  const organization = await makeOrganization({ name: `Social evidence ${suffix}` });
  const profile = await makeDesigner({
    userId: owner.id,
    orgId: organization.id,
    displayName: 'Maison Élan Studio',
    slug: `social-${suffix}`,
    projectCount: 1,
    status: 'active',
    bio: 'Thoughtful homes, natural materials and everyday comfort.',
  });
  const logoKey = `originals/logos/${profile.id}/mark.png`;
  const coverKey = `derivatives/social-${suffix}/large.jpg`;
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  try {
    await putObject({
      key: logoKey,
      body: await readFile(resolve('../apps/web/public/images/email/tickif-mark.png')),
      contentType: 'image/png',
    });
    await putObject({
      key: coverKey,
      body: await readFile(
        resolve('../apps/web/public/images/home-hero/warm-pendant-living-room.jpg'),
      ),
      contentType: 'image/jpeg',
    });
    await db
      .update(schema.designerProfile)
      .set({ logoImageId: logoKey })
      .where(eq(schema.designerProfile.id, profile.id));
    await makePublicPortfolio({ profileId: profile.id, portfolioSlug: profile.slug });
    const project = await makeProject({
      designerId: profile.id,
      title: 'A warm home for everyday living — Maison Élan',
      description: 'A published synthetic project for social preview acceptance.',
      status: 'published',
      propertyTypeSlug: 'residential',
      propertySubtypeSlug: 'apartment',
      publishedAt: new Date(),
    });
    const image = await makeProjectImage({
      projectId: project.id,
      status: 'ready',
      originalKey: `originals/social-${suffix}/private.jpg`,
      derivatives: [{ variant: 'large', format: 'jpeg', key: coverKey, width: 1280, height: 960 }],
    });
    await db
      .update(schema.project)
      .set({ coverImageId: image.id })
      .where(eq(schema.project.id, project.id));

    const routes = [
      ['home', '/', '/social-card'],
      ['designers', '/designers', '/designers/social-card'],
      ['portfolio', `/d/${profile.slug}`, `/d/${profile.slug}/social-card`],
      ['project', `/projects/${project.id}`, `/projects/${project.id}/social-card`],
      ['image', `/image/${image.id}`, `/image/${image.id}/social-card`],
      ['journal', '/blog', '/blog/social-card'],
      [
        'article',
        '/blog/preparing-for-a-designer-conversation',
        '/blog/preparing-for-a-designer-conversation/social-card',
      ],
    ];
    for (const [label, path, cardPath] of routes) {
      if (!label || !path || !cardPath) throw new Error('Incomplete route fixture');
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.locator('h1').first()).toBeVisible();
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
        'content',
        `${webUrl}${cardPath}`,
      );
      await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
        'content',
        'summary_large_image',
      );
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        `${webUrl}${path}`,
      );
      expect(await page.title()).toContain('Tickif');
      const card = await request.get(cardPath);
      expect(card.status()).toBe(200);
      expect(card.headers()['content-type']).toContain('image/png');
      const png = await card.body();
      expect(png.subarray(1, 4).toString()).toBe('PNG');
      expect(png.readUInt32BE(16)).toBe(1200);
      expect(png.readUInt32BE(20)).toBe(630);
      await testInfo.attach(`${label}-generated-card`, { body: png, contentType: 'image/png' });
      await page.goto(cardPath);
      await expect(page.locator('img')).toBeVisible();
      const screenshot = await page.screenshot({
        path: testInfo.outputPath(`${label}-social-card.png`),
      });
      await testInfo.attach(`${label}-browser-preview`, {
        body: screenshot,
        contentType: 'image/png',
      });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/projects/${project.id}`);
    await expect(page.locator('h1').first()).toContainText(project.title);
    await page.screenshot({ path: testInfo.outputPath('project-mobile.png') });

    await db
      .update(schema.project)
      .set({
        title:
          'Maison Élan — A carefully considered home with natural materials, warm lighting and room for everyday family life'.repeat(
            2,
          ),
      })
      .where(eq(schema.project.id, project.id));
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/projects/${project.id}/social-card`);
    await expect(page.locator('img')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('long-unicode-project-title.png') });

    await deleteObject(coverKey);
    const fallback = await request.get(`/projects/${project.id}/social-card`);
    expect(fallback.status()).toBe(200);
    await testInfo.attach('missing-media-branded-fallback', {
      body: await fallback.body(),
      contentType: 'image/png',
    });
    await db
      .update(schema.project)
      .set({ status: 'draft' })
      .where(eq(schema.project.id, project.id));
    for (const path of [`/projects/${project.id}/social-card`, `/image/${image.id}/social-card`]) {
      const hidden = await request.get(path);
      expect(hidden.status()).toBe(404);
      expect(hidden.headers()['cache-control']).toContain('no-store');
      expect(await hidden.text()).not.toContain(project.title);
    }
    await db
      .update(schema.designerPortfolio)
      .set({ publicLinkEnabled: false })
      .where(eq(schema.designerPortfolio.profileId, profile.id));
    expect((await request.get(`/d/${profile.slug}/social-card`)).status()).toBe(404);
    expect((await request.get('/blog/unpublished-article/social-card')).status()).toBe(404);
    expect(pageErrors).toEqual([]);
    await testInfo.attach('browser-console', {
      body: JSON.stringify(consoleErrors, null, 2),
      contentType: 'application/json',
    });
    expect(consoleErrors).toEqual([]);
  } finally {
    await assertTestDb();
    await db.delete(schema.organization).where(eq(schema.organization.id, organization.id));
    await db.delete(schema.user).where(eq(schema.user.id, owner.id));
    await Promise.all([deleteObject(logoKey), deleteObject(coverKey)]);
  }
});
