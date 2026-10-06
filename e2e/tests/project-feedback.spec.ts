import '../lib/environment';
import { expect, test } from '@playwright/test';
import { db, eq, schema } from '@repo/db';
import { projectDetailResponseSchema } from '@repo/contracts';
import { createProjectVersionFixture } from '../lib/project-version-fixtures';
import { moderationApiUrl, signInProjectAdmin } from '../lib/project-moderation-fixtures';
import { webUrl } from '../lib/environment';

test('project budget choices persist and room descriptions are absent from the editor', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120_000);
  const fixture = await createProjectVersionFixture();
  const { target } = fixture;
  try {
    await db
      .update(schema.project)
      .set({ status: 'draft' })
      .where(eq(schema.project.id, target.id));
    await signInProjectAdmin(context, fixture.owner.phoneNumber);
    const active = await context.request.post(
      `${moderationApiUrl}/api/auth/organization/set-active`,
      {
        headers: { origin: webUrl },
        data: { organizationId: fixture.organization.id },
      },
    );
    expect(active.ok()).toBeTruthy();
    await page.goto(`/designer/projects/upload?projectId=${target.id}`);
    const budget = page.getByLabel('Cost range', { exact: true });
    await expect(budget).toHaveValue('upscale');
    await expect(budget.locator('option:checked')).toHaveText('₹15L - ₹35L');
    await expect(page.getByText('About this room', { exact: true })).toHaveCount(0);
    await budget.selectOption('30l-40l');
    await expect(budget.locator('option:not([value=""])')).toHaveText([
      'Under ₹5L',
      '₹5L - ₹10L',
      '₹10L - ₹20L',
      '₹20L - ₹30L',
      '₹30L - ₹40L',
      '₹40L - ₹50L',
      '₹50L - ₹1Cr',
      '₹1Cr+',
    ]);
    await page.getByRole('button', { name: 'Save as draft', exact: true }).click();
    const readBudget = async () => {
      const response = await context.request.get(`${moderationApiUrl}/api/projects/${target.id}`);
      expect(response.ok()).toBeTruthy();
      return projectDetailResponseSchema.parse(await response.json()).budgetBandSlug;
    };
    await expect.poll(readBudget).toBe('30l-40l');
    await page.reload();
    await expect(budget).toHaveValue('30l-40l');
    await budget.scrollIntoViewIfNeeded();
    await testInfo.attach('project-budget-ranges', {
      body: await page.screenshot({ path: testInfo.outputPath('budget-ranges.png') }),
      contentType: 'image/png',
    });
    await budget.selectOption('1cr-plus');
    await page.getByRole('button', { name: 'Save as draft', exact: true }).click();
    await expect.poll(readBudget).toBe('1cr-plus');
    await page.reload();
    await expect(budget).toHaveValue('1cr-plus');
    await page.getByText('Upload Files', { exact: true }).first().scrollIntoViewIfNeeded();
    await testInfo.attach('room-without-description', {
      body: await page.screenshot({ path: testInfo.outputPath('room-without-description.png') }),
      contentType: 'image/png',
    });
    await page.goto('/designer/projects/upload');
    await page.getByRole('button', { name: 'Step 2 Timeline & Cost', exact: true }).click();
    await expect(budget.locator('option:not([value=""])')).toHaveCount(8);
    await expect(page.getByText('About this room', { exact: true })).toHaveCount(0);
  } finally {
    await fixture.cleanup();
  }
});
