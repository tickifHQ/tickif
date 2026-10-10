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
  const consoleErrors: string[] = [];
  context.on('page', (openedPage) => {
    openedPage.on('pageerror', (error) => errors.push(error.message));
    openedPage.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  const capture = async (name: string, targetPage = page) => {
    const path = testInfo.outputPath(name + '.png');
    await targetPage.screenshot({ path, animations: 'disabled', caret: 'initial' });
    await testInfo.attach(name, { path, contentType: 'image/png' });
  };
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
    const card = page.locator('[data-slot="tooltip-content"]');
    // Figma designer table 14737:7634: compact body-font header and landscape cover.
    const header = page.getByRole('columnheader', { name: 'Project', exact: true });
    await expect(header).toHaveCSS('height', '36px');
    await expect(header).toHaveCSS('font-size', '13px');
    await expect(header).toHaveCSS(
      'font-family',
      await page
        .getByPlaceholder('Search', { exact: true })
        .evaluate((element) => getComputedStyle(element).fontFamily),
    );
    const thumbnail = preview.locator(':scope > span').first();
    await expect(thumbnail).toHaveCSS('width', '52px');
    await expect(thumbnail).toHaveCSS('height', '40px');
    // A click is replayed across hydration; an early pointer hover is not.
    // Establish the interactive preview before checking each input modality.
    await preview.click();
    await expect(card).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(card).toHaveCount(0);
    await page.mouse.move(0, 0);
    await preview.hover();
    await expect(card).toBeVisible();
    await expect(card).toContainText(pendingTitle);
    await expect(card).toContainText('Last updated');
    await capture('project-preview-desktop', page);
    await page.keyboard.press('Escape');
    await expect(card).toHaveCount(0);
    const status = row.getByRole('button', { name: 'Submitted details' });
    await status.focus();
    await expect(card).toBeVisible();
    // Feedback card 14740:3734 retains the measured width with live status copy.
    await expect(card).toHaveCSS('width', '300px');
    await expect(card).toContainText('Your published version is still live.');
    await expect(card).toContainText('waiting for review');
    await capture('pending-status-keyboard-desktop', page);
    await page.keyboard.press('Escape');
    await expect(card).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await preview.scrollIntoViewIfNeeded();
    await preview.tap();
    await expect(card).toBeVisible();
    const bounds = await card.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    await capture('project-preview-mobile-touch', page);
    await page.keyboard.press('Escape');
    await expect(card).toHaveCount(0);
    await status.scrollIntoViewIfNeeded();
    await status.tap();
    await expect(card).toContainText('Your published version is still live.');
    // Wait for the entry scale animation before checking rendered bounds.
    await expect.poll(async () => (await card.boundingBox())?.width).toBe(300);
    const statusBounds = await card.boundingBox();
    expect(statusBounds).not.toBeNull();
    expect(statusBounds!.x).toBeGreaterThanOrEqual(0);
    expect(statusBounds!.x + statusBounds!.width).toBeLessThanOrEqual(390);
    await capture('pending-status-mobile-touch', page);
    await page.keyboard.press('Escape');
    await expect(card).toHaveCount(0);
    expect(errors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  } finally {
    await testInfo.attach('console-errors', {
      body: JSON.stringify(consoleErrors),
      contentType: 'application/json',
    });
    await fixture.cleanup();
  }
});
