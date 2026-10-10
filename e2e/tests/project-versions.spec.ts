import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { db, eq, schema } from '@repo/db';
import { deleteObject, putObject } from '@repo/storage';
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
  const logoKey = `originals/logos/${target.designerId}/dashboard-regression.png`;
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
    await expect(designerPage.getByRole('button', { name: 'Withdraw and edit' })).toBeVisible();
  };
  try {
    // Complete this guarded synthetic fixture's dashboard setup using real persistence.
    await putObject({
      key: logoKey,
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4d0AAAAASUVORK5CYII=',
        'base64',
      ),
      contentType: 'image/png',
    });
    await db.insert(schema.account).values({
      id: randomUUID(),
      accountId: fixture.owner.id,
      providerId: 'google',
      userId: fixture.owner.id,
    });
    await db
      .update(schema.designerProfile)
      .set({ logoImageId: logoKey, bio: 'Thoughtful interiors for everyday living.' })
      .where(eq(schema.designerProfile.id, target.designerId));
    await db.insert(schema.designerPortfolio).values({
      profileId: target.designerId,
      tagline: 'Spaces designed around you',
      showHero: false,
      publicLinkEnabled: true,
    });
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
      body: await designerPage.screenshot({ animations: 'disabled', caret: 'initial' }),
      contentType: 'image/png',
    });
    await submitPending();
    await expectPublicTitle(target.title);
    await startReview(rejectedTitle);
    await designerPage.reload();
    await designerPage.setViewportSize({ width: 1440, height: 960 });
    await expect(projectName).toHaveValue(rejectedTitle);
    await expect(projectName).toBeDisabled();
    await testInfo.attach('live-project-review-locked', {
      body: await designerPage.screenshot({ animations: 'disabled', caret: 'initial' }),
      contentType: 'image/png',
    });

    await designerPage.goto('/designer/dashboard');
    const overview = designerPage.getByTestId('post-setup-overview');
    const recentRow = overview.getByRole('link', { name: new RegExp(rejectedTitle) });
    for (const [size, viewport] of [
      ['desktop', { width: 1440, height: 960 }],
      ['mobile', { width: 390, height: 844 }],
    ] as const) {
      await designerPage.setViewportSize(viewport);
      await expect(overview).toBeVisible();
      await expect(overview.locator('[data-metric="total-projects"]')).toHaveText('1');
      await expect(overview.locator('[data-metric="live-projects"]')).toHaveText('1');
      await expect(overview.locator('[data-metric="in-review-projects"]')).toHaveText('1');
      await expect(recentRow).toHaveAttribute('href', `/designer/projects/${target.id}/edit`);
      await expect(recentRow.getByText('Live', { exact: true })).toBeVisible();
      await expect(
        recentRow.getByText('Pending changes · In review', { exact: true }),
      ).toBeVisible();
      await expect
        .poll(() => designerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
      await testInfo.attach(`dashboard-live-pending-${size}`, {
        body: await designerPage.screenshot({
          fullPage: true,
          animations: 'disabled',
          caret: 'initial',
        }),
        contentType: 'image/png',
      });
    }
    await recentRow.click();
    await expect(projectName).toHaveValue(rejectedTitle);
    await expect(projectName).toBeDisabled();
    await designerPage.setViewportSize({ width: 1440, height: 960 });
    await designerPage.getByRole('button', { name: 'Withdraw and edit' }).click();
    await expect(projectName).toBeEnabled();
    await expect(projectName).toHaveValue(rejectedTitle);
    await expect.poll(async () => (await readInternal()).status).toBe('draft');
    await expectPublicTitle(target.title);
    await testInfo.attach('live-project-withdrawn-for-editing', {
      body: await designerPage.screenshot({ animations: 'disabled', caret: 'initial' }),
      contentType: 'image/png',
    });
    await submitPending();
    await startReview(rejectedTitle);
    await designerPage.goto('/designer/projects');
    await expect(designerPage.getByRole('link', { name: /Live 1/ })).toBeVisible();
    await expect(designerPage.getByRole('link', { name: /In review 1/ })).toBeVisible();
    await expect(designerPage.getByText('Pending changes · In review')).toBeVisible();
    await testInfo.attach('live-project-count-and-review-status', {
      body: await designerPage.screenshot({ animations: 'disabled', caret: 'initial' }),
      contentType: 'image/png',
    });
    await expect(
      adminPage.getByRole('heading', { name: 'Reviewing pending changes' }),
    ).toBeVisible();
    const comparison = adminPage.getByRole('table', { name: 'Live and pending project metadata' });
    await expect(comparison.getByText(target.title, { exact: true })).toBeVisible();
    await expect(comparison.getByText(rejectedTitle, { exact: true })).toBeVisible();
    await testInfo.attach('e252-live-pending-review-desktop', {
      body: await adminPage.screenshot({ animations: 'disabled', caret: 'initial' }),
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
      body: await publicPage.screenshot({ animations: 'disabled', caret: 'initial' }),
      contentType: 'image/png',
    });
    const save = publicPage.getByRole('button', { name: 'Sign in to save project' });
    await expect(save).toBeEnabled();
    await save.click();
    const loginDialog = publicPage.getByRole('dialog', { name: 'Sign in to continue' });
    await expect(loginDialog).toBeVisible();
    await expect(publicPage).toHaveURL(`${webUrl}${publicPath}`);
    await loginDialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(loginDialog).toBeHidden();
    await expect(publicPage.getByRole('img', { name: '0 project views' }).first()).toBeVisible();
    await expect(publicPage.getByRole('button', { name: /like project/i })).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await Promise.allSettled([designerContext.close(), publicContext.close()]);
    await fixture.cleanup();
    await deleteObject(logoKey);
  }
});
