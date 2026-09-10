import { expect, test } from '@playwright/test';
import {
  adminModerationDetailResponseSchema,
  projectDetailResponseSchema,
  publicProjectPageResponseSchema,
} from '@repo/contracts';
import { createProjectVersionFixture } from '../lib/project-version-fixtures';
import { moderationApiUrl, signInProjectAdmin } from '../lib/project-moderation-fixtures';
import { webUrl } from '../lib/environment';

test('published project edits keep live content through rejection and replace it only on approval', async ({
  page: adminPage,
  context: adminContext,
  browser,
}, testInfo) => {
  test.setTimeout(240_000);
  const fixture = await createProjectVersionFixture();
  const { target } = fixture;
  const designerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const publicContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const designerPage = await designerContext.newPage();
  const publicPage = await publicContext.newPage();
  const errors: string[] = [];
  for (const page of [adminPage, designerPage, publicPage]) {
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
  }
  const publicPath = `/projects/${target.id}`;
  const projectName = designerPage
    .locator('label')
    .filter({ hasText: /^Project name$/ })
    .locator('..')
    .getByRole('textbox');
  const readInternal = async () => {
    const response = await designerContext.request.get(
      `${moderationApiUrl}/api/projects/${target.id}`,
    );
    expect(response.ok()).toBeTruthy();
    return projectDetailResponseSchema.parse(await response.json());
  };
  const readReview = async () => {
    const response = await adminContext.request.get(
      `${moderationApiUrl}/api/admin/projects/${target.id}`,
    );
    expect(response.ok()).toBeTruthy();
    return adminModerationDetailResponseSchema.parse(await response.json());
  };
  const expectPublicTitle = async (title: string) => {
    await publicPage.goto(publicPath);
    await expect(publicPage.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(publicPage).toHaveTitle(`${title} | Tickif`);
    await expect(publicPage.locator('meta[property="og:title"]')).toHaveAttribute('content', title);
    await expect(publicPage.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `${webUrl}${publicPath}`,
    );
    const response = await publicContext.request.get(
      `${moderationApiUrl}/api/projects/public/${target.id}`,
    );
    expect(response.ok()).toBeTruthy();
    const project = publicProjectPageResponseSchema.parse(await response.json());
    expect(project).toMatchObject({ id: target.id, title });
    expect(project).not.toHaveProperty('pendingChanges');
    expect(project).not.toHaveProperty('liveVersion');
  };
  const startReview = async (title: string) => {
    await adminPage.goto('/moderation?status=submitted&page=1');
    await adminPage.getByRole('button', { name: `Open review for ${title}` }).click();
    await adminPage.getByRole('button', { name: 'Start review', exact: true }).click();
    await expect.poll(async () => (await readReview()).project.status).toBe('in_review');
  };
  const saveTitle = async (previous: string, next: string) => {
    await designerPage.goto(`/designer/projects/upload?projectId=${target.id}`);
    await expect(projectName).toHaveValue(previous);
    await projectName.fill(next);
    await designerPage.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect
      .poll(async () => {
        const project = await readInternal();
        return {
          title: project.title,
          pendingChanges: project.pendingChanges,
          liveStatus: project.liveStatus,
        };
      })
      .toEqual({ title: next, pendingChanges: true, liveStatus: 'published' });
    await expect(designerPage.getByText('Live · Pending changes', { exact: true })).toBeVisible();
  };
  const submitPending = async () => {
    await designerPage
      .getByRole('button', { name: 'Submit changes for review', exact: true })
      .click();
    await expect.poll(async () => (await readInternal()).status).toBe('draft');
    await designerPage.getByRole('button', { name: 'Confirm & submit', exact: true }).click();
    await expect.poll(async () => (await readInternal()).status).toBe('submitted');
    await designerPage.reload();
    await expect(designerPage.getByText(/Editing is paused during review/)).toBeVisible();
  };
  try {
    await signInProjectAdmin(adminContext, fixture.admin.phoneNumber);
    await signInProjectAdmin(designerContext, fixture.owner.phoneNumber);
    const active = await designerContext.request.post(
      `${moderationApiUrl}/api/auth/organization/set-active`,
      {
        headers: { origin: webUrl },
        data: { organizationId: fixture.organization.id },
      },
    );
    expect(active.ok()).toBeTruthy();

    await startReview(target.title);
    await adminPage.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect.poll(async () => (await readReview()).project.status).toBe('published');
    await expectPublicTitle(target.title);

    const rejectedTitle = `Unapproved redesign ${target.id.slice(0, 8)}`;
    await saveTitle(target.title, rejectedTitle);
    await expectPublicTitle(target.title);
    await designerPage.reload();
    await expect(projectName).toHaveValue(rejectedTitle);
    await designerPage.setViewportSize({ width: 390, height: 844 });
    await designerPage
      .getByText('Live · Pending changes', { exact: true })
      .scrollIntoViewIfNeeded();
    await expect
      .poll(() => designerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await testInfo.attach('e252-pending-designer-mobile', {
      body: await designerPage.screenshot({ animations: 'disabled' }),
      contentType: 'image/png',
    });
    await submitPending();
    await expectPublicTitle(target.title);
    await startReview(rejectedTitle);
    await expect(
      adminPage.getByRole('heading', { name: 'Reviewing pending changes' }),
    ).toBeVisible();
    const comparison = adminPage.getByRole('table', { name: 'Live and pending project metadata' });
    await expect(comparison.getByText(target.title, { exact: true })).toBeVisible();
    await expect(comparison.getByText(rejectedTitle, { exact: true })).toBeVisible();
    await testInfo.attach('e252-live-pending-review-desktop', {
      body: await adminPage.screenshot({ animations: 'disabled' }),
      contentType: 'image/png',
    });
    await adminPage.getByRole('button', { name: 'Reject', exact: true }).click();
    await adminPage.getByLabel('Note', { exact: true }).fill('Keep the approved project identity.');
    await adminPage.getByRole('checkbox', { name: 'Project details', exact: true }).check();
    await adminPage.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect.poll(async () => (await readInternal()).pendingChanges).toBeUndefined();
    await expectPublicTitle(target.title);

    const approvedTitle = `Approved refreshed room ${target.id.slice(0, 8)}`;
    await designerPage.setViewportSize({ width: 1440, height: 1000 });
    await saveTitle(target.title, approvedTitle);
    await submitPending();
    await startReview(approvedTitle);
    await expectPublicTitle(target.title);
    await adminPage.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect.poll(async () => (await readInternal()).pendingChanges).toBeUndefined();
    await expectPublicTitle(approvedTitle);

    const description = 'A minor description update is visible without another review.';
    const minor = await designerContext.request.patch(
      `${moderationApiUrl}/api/projects/${target.id}`,
      {
        headers: { origin: webUrl },
        data: { description },
      },
    );
    expect(minor.ok()).toBeTruthy();
    const minorProject = projectDetailResponseSchema.parse(await minor.json());
    expect(minorProject).toMatchObject({
      status: 'published',
      description,
    });
    expect(minorProject).not.toHaveProperty('pendingChanges');
    await publicPage.setViewportSize({ width: 390, height: 844 });
    await expectPublicTitle(approvedTitle);
    await expect(publicPage.getByText(description, { exact: true }).first()).toBeVisible();
    await expect
      .poll(() => publicPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await testInfo.attach('e252-approved-public-mobile', {
      body: await publicPage.screenshot({ animations: 'disabled' }),
      contentType: 'image/png',
    });
    const loginHref = `/login?callbackURL=${encodeURIComponent(publicPath)}`;
    await expect(publicPage.getByRole('link', { name: 'Sign in to save project' })).toHaveAttribute(
      'href',
      loginHref,
    );
    const like = publicPage.getByRole('button', { name: 'Sign in to like project' });
    await expect(like).toBeEnabled();
    await like.scrollIntoViewIfNeeded();
    await testInfo.attach('e252-public-actions-mobile', {
      body: await publicPage.screenshot({ animations: 'disabled' }),
      contentType: 'image/png',
    });
    await like.click();
    await expect(publicPage).toHaveURL(`${webUrl}${loginHref}`);
    expect(errors).toEqual([]);
  } finally {
    await Promise.allSettled([designerContext.close(), publicContext.close()]);
    await fixture.cleanup();
  }
});
