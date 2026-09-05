import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, test } from '@playwright/test';
import { adminModerationDetailResponseSchema } from '@repo/contracts';
import {
  createProjectModerationFixture,
  moderationApiUrl,
  signInProjectAdmin,
} from '../lib/project-moderation-fixtures';

test('admin paginates, claims, comments, resolves and completes project moderation decisions', async ({
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
      if (action === 'Reject')
        await page.getByLabel('Reason code', { exact: true }).fill('quality');
      await page.getByRole('button', { name: 'Confirm', exact: true }).click();
      await expect.poll(async () => (await readDetail(project.id)).project.status).toBe(status);
      await close();
    }
    expect(errors).toEqual([]);
  } finally {
    await fixture.cleanup();
  }
});
