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
    await expect(budget).toHaveText('₹15L - ₹35L');
    await expect(page.getByText('About this room', { exact: true })).toHaveCount(0);
    await budget.click();
    await page.getByRole('option', { name: '₹30L - ₹40L', exact: true }).click();
    await budget.click();
    await expect(page.getByRole('option')).toHaveText([
      'Under ₹5L',
      '₹5L - ₹10L',
      '₹10L - ₹20L',
      '₹20L - ₹30L',
      '₹30L - ₹40L',
      '₹40L - ₹50L',
      '₹50L - ₹1Cr',
      '₹1Cr+',
    ]);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Save as draft', exact: true }).click();
    const readBudget = async () => {
      const response = await context.request.get(`${moderationApiUrl}/api/projects/${target.id}`);
      expect(response.ok()).toBeTruthy();
      return projectDetailResponseSchema.parse(await response.json()).budgetBandSlug;
    };
    await expect.poll(readBudget).toBe('30l-40l');
    await page.reload();
    await expect(budget).toHaveText('₹30L - ₹40L');
    await budget.scrollIntoViewIfNeeded();
    await testInfo.attach('project-budget-ranges', {
      body: await page.screenshot({ path: testInfo.outputPath('budget-ranges.png') }),
      contentType: 'image/png',
    });
    await budget.click();
    await page.getByRole('option', { name: '₹1Cr+', exact: true }).click();
    await page.getByRole('button', { name: 'Save as draft', exact: true }).click();
    await expect.poll(readBudget).toBe('1cr-plus');
    await page.reload();
    await expect(budget).toHaveText('₹1Cr+');
    await page.getByText('Upload Files', { exact: true }).first().scrollIntoViewIfNeeded();
    await testInfo.attach('room-without-description', {
      body: await page.screenshot({ path: testInfo.outputPath('room-without-description.png') }),
      contentType: 'image/png',
    });
    await page.goto('/designer/projects/upload');
    await page.getByRole('button', { name: 'Step 2 Timeline & Cost', exact: true }).click();
    await budget.click();
    await expect(page.getByRole('option')).toHaveCount(8);
    await page.keyboard.press('Escape');
    await expect(page.getByText('About this room', { exact: true })).toHaveCount(0);
  } finally {
    await fixture.cleanup();
  }
});

test('custom room types persist and appear as search filters', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120_000);
  const fixture = await createProjectVersionFixture();
  const roomName = `Observatory ${fixture.target.id.slice(0, 8)}`;
  let customRoomId: string | undefined;
  try {
    await db
      .update(schema.project)
      .set({ status: 'draft' })
      .where(eq(schema.project.id, fixture.target.id));
    await signInProjectAdmin(context, fixture.owner.phoneNumber);
    const active = await context.request.post(
      `${moderationApiUrl}/api/auth/organization/set-active`,
      {
        headers: { origin: webUrl },
        data: { organizationId: fixture.organization.id },
      },
    );
    expect(active.ok()).toBeTruthy();
    await page.goto(`/designer/projects/upload?projectId=${fixture.target.id}`);
    await page.getByRole('button', { name: 'Add new room type' }).click();
    await page.getByPlaceholder('Search room types').fill(roomName);
    await page.getByRole('button', { name: `Create “${roomName}”` }).click();
    await expect(page.getByRole('button', { name: `Delete ${roomName}` })).toBeVisible();
    const termsResponse = await context.request.get(
      `${moderationApiUrl}/api/taxonomy/terms?kind=room`,
    );
    const terms = await termsResponse.json();
    customRoomId = terms.terms.find(
      (term: { label: string; id: string }) => term.label === roomName,
    )?.id;
    expect(customRoomId).toBeTruthy();
    await page.getByRole('button', { name: 'Save as draft', exact: true }).click();
    await expect
      .poll(async () => {
        const response = await context.request.get(
          `${moderationApiUrl}/api/projects/${fixture.target.id}`,
        );
        return projectDetailResponseSchema
          .parse(await response.json())
          .rooms.some((room) => room.roomTypeId === customRoomId);
      })
      .toBe(true);
    await page.reload();
    await expect(page.getByRole('button', { name: `Delete ${roomName}` })).toBeVisible();
    const savedRoom = page.getByRole('button', { name: `Delete ${roomName}` });
    for (const viewport of [
      { name: 'desktop', width: 1440, height: 1000 },
      { name: 'mobile', width: 390, height: 844 },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await savedRoom.scrollIntoViewIfNeeded();
      await expect(savedRoom).toBeVisible();
      await expect(page.getByText(roomName, { exact: true })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await testInfo.attach(`custom-room-${viewport.name}`, {
        body: await page.screenshot({
          path: testInfo.outputPath(`custom-room-${viewport.name}.png`),
        }),
        contentType: 'image/png',
      });
    }

    await db
      .update(schema.project)
      .set({ status: 'published' })
      .where(eq(schema.project.id, fixture.target.id));
    await db
      .update(schema.projectRoom)
      .set({ isLive: true })
      .where(eq(schema.projectRoom.projectId, fixture.target.id));
    const suggestions = await context.request.get(
      `${moderationApiUrl}/api/search/suggest?q=${encodeURIComponent(roomName)}`,
    );
    expect(suggestions.ok()).toBeTruthy();
    expect(await suggestions.text()).toContain(roomName);
  } finally {
    await fixture.cleanup();
    if (customRoomId) await db.delete(schema.taxonomy).where(eq(schema.taxonomy.id, customRoomId));
  }
});
