import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, test } from '@playwright/test';
import { adminModerationDetailResponseSchema } from '@repo/contracts';
import {
  createProjectModerationFixture,
  moderationApiUrl,
  signInProjectAdmin,
} from '../lib/project-moderation-fixtures';

test('E-254 categories persist and reach designer feedback on desktop and mobile', async ({
  page,
  context,
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const fixture = await createProjectModerationFixture();
  const target = fixture.projects[0]!;
  const designerContext = await browser.newContext();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  try {
    await signInProjectAdmin(context, fixture.admin.phoneNumber);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/moderation');
    await expect(page).toHaveTitle('Moderation queue · Tickif');
    await expect(page.getByRole('heading', { name: 'Moderation queue' })).toBeVisible();
    await page.getByRole('button', { name: `Open review for ${target.title}` }).click();
    await page.getByRole('button', { name: 'Start review', exact: true }).click();
    await page.getByRole('button', { name: 'Request changes', exact: true }).click();
    await page
      .getByLabel('Note', { exact: true })
      .fill('Replace blurred photos and correct room tags.');
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Select at least one reason category');
    await page.getByRole('checkbox', { name: 'Image quality', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Room tagging', exact: true }).check();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await testInfo.attach('e254-review-categories-desktop', {
      body: await page.screenshot({ animations: 'disabled' }),
      contentType: 'image/png',
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        page
          .getByRole('dialog')
          .last()
          .evaluate((element) => element.scrollWidth <= element.clientWidth),
      )
      .toBe(true);
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect
      .poll(async () => {
        const response = await context.request.get(
          `${moderationApiUrl}/api/admin/projects/${target.id}`,
        );
        return adminModerationDetailResponseSchema.parse(await response.json()).project
          .rejectionReasonCodes;
      })
      .toEqual(['image-quality', 'room-tagging']);

    await signInProjectAdmin(designerContext, fixture.owner.phoneNumber);
    const activeOrganization = await designerContext.request.post(
      `${moderationApiUrl}/api/auth/organization/set-active`,
      {
        headers: { origin: new URL(page.url()).origin },
        data: { organizationId: fixture.organization.id },
      },
    );
    expect(activeOrganization.ok()).toBeTruthy();
    const designerPage = await designerContext.newPage();
    designerPage.on('pageerror', (error) => errors.push(error.message));
    designerPage.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await designerPage.setViewportSize({ width: 1440, height: 1000 });
    await designerPage.goto(`/designer/projects/upload?projectId=${target.id}`);
    await expect(designerPage).toHaveTitle('Upload project · Tickif');
    await expect(
      designerPage.getByRole('heading', { name: 'Upload project', exact: true }),
    ).toBeVisible();
    await expect(
      designerPage.getByText('Use clear, well-lit images that show the completed work.').first(),
    ).toBeVisible();
    await expect(
      designerPage.getByText('Assign each photo to the correct room and check its tags.').first(),
    ).toBeVisible();
    await designerPage.reload();
    await designerPage.setViewportSize({ width: 390, height: 844 });
    await expect(
      designerPage.getByText('Replace blurred photos and correct room tags.').first(),
    ).toBeVisible();
    await designerPage
      .getByText('Replace blurred photos and correct room tags.')
      .first()
      .scrollIntoViewIfNeeded();
    await expect
      .poll(() => designerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await testInfo.attach('e254-designer-feedback-mobile', {
      body: await designerPage.screenshot({ animations: 'disabled' }),
      contentType: 'image/png',
    });

    // E-279: the designer opens the moderation-history drawer (right-side),
    // sees the complete masked timeline for the moderation activity, refreshes
    // (real refetch, timeline stays visible), and closes it via Escape.
    await designerPage.setViewportSize({ width: 1440, height: 1000 });
    await designerPage
      .getByRole('button', { name: 'View moderation history', exact: true })
      .click();
    const historyDrawer = designerPage.getByRole('dialog');
    await expect(historyDrawer.getByText('Moderation history')).toBeVisible();
    // Timeline shows the masked, reviewer-safe attribution and the transition.
    await expect(historyDrawer.getByText('Request Changes').first()).toBeVisible();
    await expect(historyDrawer.getByText('by Tickif Review Team').first()).toBeVisible();
    // Refresh performs a real refetch while keeping the timeline visible.
    await designerPage
      .getByRole('button', { name: 'Refresh moderation history', exact: true })
      .click();
    await expect(historyDrawer.getByText('Request Changes').first()).toBeVisible();
    await testInfo.attach('e279-designer-moderation-history-drawer', {
      body: await designerPage.screenshot({ animations: 'disabled' }),
      contentType: 'image/png',
    });
    // Escape closes the drawer and focus returns to the opener so keyboard
    // users keep their place in the long upload form (E-279 focus restoration).
    await designerPage.keyboard.press('Escape');
    await expect(designerPage.getByRole('dialog')).toHaveCount(0);
    await expect(
      designerPage.getByRole('button', { name: 'View moderation history', exact: true }),
    ).toBeFocused();

    expect(errors).toEqual([]);
  } finally {
    await designerContext.close();
    await fixture.cleanup();
  }
});

test('project moderation lifecycle: admin paginates, claims, comments, resolves and completes decisions', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(180_000);
  const fixture = await createProjectModerationFixture();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const target = fixture.projects[20]!;
  const readDetail = async (id: string) => {
    const response = await context.request.get(`${moderationApiUrl}/api/admin/projects/${id}`);
    expect(response.ok()).toBeTruthy();
    return adminModerationDetailResponseSchema.parse(await response.json());
  };
  const open = (title: string) =>
    page.getByRole('button', { name: `Open review for ${title}` }).click();
  const close = () => page.getByRole('button', { name: 'Close', exact: true }).first().click();
  const screenshot = async (name: string) => {
    const path = join(tmpdir(), `tickif-project-moderation-${testInfo.workerIndex}-${name}.png`);
    await page.screenshot({ path, fullPage: false, animations: 'disabled' });
    await testInfo.attach(name, { path, contentType: 'image/png' });
  };
  try {
    await signInProjectAdmin(context, fixture.admin.phoneNumber);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/moderation');
    await expect(page).toHaveTitle('Moderation queue · Tickif');
    await expect(page.getByRole('heading', { name: 'Moderation queue' })).toBeVisible();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page).toHaveURL(/status=submitted&page=2/);
    await expect(page.getByText(target.title, { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText(target.title, { exact: true })).toBeVisible();
    await page.goBack();
    await expect(page.getByText(fixture.projects[0]!.title, { exact: true })).toBeVisible();
    await page.goForward();
    await open(target.title);
    await page.getByRole('button', { name: 'Start review', exact: true }).click();
    await expect.poll(async () => (await readDetail(target.id)).project.status).toBe('in_review');
    await page.goto('/moderation?status=in_review&page=1');
    await open(target.title);
    await page
      .getByLabel('Review comment', { exact: true })
      .fill('Please confirm the kitchen photo.');
    await page.getByRole('button', { name: 'Add comment', exact: true }).click();
    await expect(
      page.getByText('Please confirm the kitchen photo.', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeDisabled();
    await expect(page.getByText(/Tickif Review Team ·/).first()).toBeVisible();
    await screenshot('comment-desktop');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        page.getByRole('dialog').evaluate((element) => element.scrollWidth <= element.clientWidth),
      )
      .toBe(true);
    await page
      .getByRole('heading', { name: 'Review comments', exact: true })
      .scrollIntoViewIfNeeded();
    await screenshot('comment-mobile');
    await page.getByRole('button', { name: 'Resolve comment', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect.poll(async () => (await readDetail(target.id)).project.status).toBe('published');
    await close();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('tab', { name: /Published/ }).click();
    await open(target.title);
    await page.getByRole('button', { name: 'Unpublish', exact: true }).click();
    await page.getByLabel('Note', { exact: true }).fill('Synthetic publication rollback review.');
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect.poll(async () => (await readDetail(target.id)).project.status).toBe('in_review');
    await close();
    for (const [index, action, status] of [
      [0, 'Request changes', 'changes_requested'],
      [1, 'Reject', 'rejected'],
    ] as const) {
      const project = fixture.projects[index]!;
      await page.getByRole('tab', { name: /Submitted/ }).click();
      await open(project.title);
      await page.getByRole('button', { name: 'Start review', exact: true }).click();
      await page.getByRole('button', { name: action, exact: true }).click();
      await page
        .getByLabel('Note', { exact: true })
        .fill('Synthetic moderation decision with a required explanation.');
      await page.getByRole('button', { name: 'Confirm', exact: true }).click();
      await expect(page.getByRole('alert')).toHaveText('Select at least one reason category');
      await page.getByRole('checkbox', { name: 'Image quality', exact: true }).check();
      await page.getByRole('checkbox', { name: 'Room tagging', exact: true }).check();
      await page.getByRole('button', { name: 'Confirm', exact: true }).click();
      await expect.poll(async () => (await readDetail(project.id)).project.status).toBe(status);
      const detail = await readDetail(project.id);
      expect(detail.project.rejectionReasonCodes).toEqual(['image-quality', 'room-tagging']);
      expect(detail.history.at(-1)?.reasonCodes).toEqual(['image-quality', 'room-tagging']);
      await close();
    }
    expect(errors).toEqual([]);
  } finally {
    await fixture.cleanup();
  }
});
