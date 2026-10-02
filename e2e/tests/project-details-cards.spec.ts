import { expect, test } from '@playwright/test';
import { db, eq, schema } from '@repo/db';
import { projectDetailResponseSchema, listProjectsResponseSchema } from '@repo/contracts';
import { createProjectVersionFixture } from '../lib/project-version-fixtures';
import { moderationApiUrl, signInProjectAdmin } from '../lib/project-moderation-fixtures';
import { webUrl } from '../lib/environment';

test.use({ hasTouch: true, video: 'on', viewport: { width: 1440, height: 1000 } });

test('project preview and status cards support hover, keyboard and mobile touch', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(180_000);
  const fixture = await createProjectVersionFixture();
  const { target } = fixture;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await db
      .update(schema.project)
      .set({ status: 'published', publishedAt: new Date() })
      .where(eq(schema.project.id, target.id));
    await db
      .update(schema.projectImage)
      .set({ isLive: true })
      .where(eq(schema.projectImage.projectId, target.id));
    await signInProjectAdmin(context, fixture.owner.phoneNumber);
    const active = await context.request.post(
      `${moderationApiUrl}/api/auth/organization/set-active`,
      { headers: { origin: webUrl }, data: { organizationId: fixture.organization.id } },
    );
    expect(active.ok()).toBeTruthy();
    const pendingTitle = `${target.title} — new revision`;
    const update = await context.request.patch(`${moderationApiUrl}/api/projects/${target.id}`, {
      headers: { origin: webUrl },
      data: { title: pendingTitle },
    });
    expect(update.ok()).toBeTruthy();
    const submit = await context.request.post(
      `${moderationApiUrl}/api/projects/${target.id}/submit`,
      { headers: { origin: webUrl } },
    );
    expect(submit.ok()).toBeTruthy();
    expect(projectDetailResponseSchema.parse(await submit.json())).toMatchObject({
      status: 'submitted',
      liveStatus: 'published',
      pendingChanges: true,
    });
    const list = await context.request.get(`${moderationApiUrl}/api/projects?status=all`);
    expect(
      listProjectsResponseSchema
        .parse(await list.json())
        .items.find((item) => item.id === target.id),
    ).toMatchObject({ publicAvailable: true });
    await page.goto('/designer/projects');
    await expect(page).toHaveTitle('Projects · Tickif');
    const row = page.getByRole('row').filter({ hasText: pendingTitle });
    await expect(row.getByText('Pending changes · Submitted')).toBeVisible();
    const preview = row.getByRole('button', { name: 'Preview ' + pendingTitle });
    await preview.hover();
    const card = page.locator('[data-slot="tooltip-content"]');
    await expect(card).toBeVisible();
    await expect(card).toContainText(pendingTitle);
    await expect(card).toContainText('Last updated');
    await testInfo.attach('project-preview-desktop', {
      body: await page.screenshot({ animations: 'disabled' }),
      contentType: 'image/png',
    });
    await page.keyboard.press('Escape');
    await expect(card).toHaveCount(0);
    const status = row.getByRole('button', { name: 'Submitted details' });
    await status.focus();
    await expect(card).toBeVisible();
    await expect(card).toContainText('Your published version is still live.');
    await expect(card).toContainText('waiting for review');
    await testInfo.attach('pending-status-keyboard-desktop', {
      body: await page.screenshot({ animations: 'disabled' }),
      contentType: 'image/png',
    });
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 844 });
    await preview.scrollIntoViewIfNeeded();
    await preview.tap();
    await expect(card).toBeVisible();
    const bounds = await card.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    await testInfo.attach('project-preview-mobile-touch', {
      body: await page.screenshot({ animations: 'disabled' }),
      contentType: 'image/png',
    });
    await page.keyboard.press('Escape');
    await status.scrollIntoViewIfNeeded();
    await status.tap();
    await expect(card).toContainText('Your published version is still live.');
    await testInfo.attach('pending-status-mobile-touch', {
      body: await page.screenshot({ animations: 'disabled' }),
      contentType: 'image/png',
    });
    await page.keyboard.press('Escape');
    await expect(card).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await fixture.cleanup();
  }
});
