import { expect, test } from '@playwright/test';
import { db, eq, schema } from '@repo/db';
import { projectDetailResponseSchema, listProjectsResponseSchema } from '@repo/contracts';
import { createProjectVersionFixture } from '../lib/project-version-fixtures';
import { moderationApiUrl, signInProjectAdmin } from '../lib/project-moderation-fixtures';
import { webUrl } from '../lib/environment';

test.use({ video: 'on', viewport: { width: 1440, height: 1000 } });

test('project view action opens the live version while submitted edits remain private', async ({
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
    const view = row.getByRole('link', {
      name: `View project: ${pendingTitle} (opens in new tab)`,
    });
    await expect(view).toBeVisible();
    await testInfo.attach('view-project-desktop', {
      body: await page.screenshot({ animations: 'disabled' }),
      contentType: 'image/png',
    });
    const popupPromise = page.waitForEvent('popup');
    await view.click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL(`${webUrl}/projects/${target.id}`);
    await expect(popup.getByRole('heading', { name: target.title, exact: true })).toBeVisible();
    await expect(popup.getByRole('heading', { name: pendingTitle, exact: true })).toHaveCount(0);
    await testInfo.attach('view-project-published-version', {
      body: await popup.screenshot({ animations: 'disabled' }),
      contentType: 'image/png',
    });
    await popup.close();
    await row.getByRole('button', { name: `More actions for ${pendingTitle}` }).click();
    await expect(page.getByRole('menuitem', { name: 'Copy link' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 844 });
    await view.scrollIntoViewIfNeeded();
    await expect(view).toBeVisible();
    await testInfo.attach('view-project-mobile', {
      body: await page.screenshot({ animations: 'disabled' }),
      contentType: 'image/png',
    });
    expect(errors).toEqual([]);
  } finally {
    await fixture.cleanup();
  }
});
