import { expect, test } from '@playwright/test';
import { adminModerationDetailResponseSchema } from '@repo/contracts';
import {
  createProjectModerationFixture,
  moderationApiUrl,
  signInProjectAdmin,
} from '../lib/project-moderation-fixtures';

test('E-371 reviewer removes one image after confirmation and keeps the other originals', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(180_000);
  const fixture = await createProjectModerationFixture({ projectCount: 1 });
  const target = fixture.projects[0]!;
  try {
    await signInProjectAdmin(context, fixture.admin.phoneNumber);
    await page.goto('/moderation');
    await page.getByRole('button', { name: `Open review for ${target.title}` }).click();
    await page.getByRole('button', { name: 'Start review', exact: true }).click();
    const read = async () => {
      const response = await context.request.get(
        `${moderationApiUrl}/api/admin/projects/${target.id}`,
      );
      expect(response.ok()).toBeTruthy();
      return adminModerationDetailResponseSchema.parse(await response.json());
    };
    const before = await read();
    const selected = before.images[0]!;
    await page.getByRole('button', { name: 'Remove image 1' }).click();
    const confirmation = page.getByRole('dialog', { name: 'Remove this image?' });
    await expect(confirmation.getByText(/other images will stay/i)).toBeVisible();
    await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect((await read()).images.map((image) => image.id)).toEqual(
      before.images.map((image) => image.id),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Remove image 1' }).click();
    await expect
      .poll(() => confirmation.evaluate((element) => element.scrollWidth <= element.clientWidth))
      .toBe(true);
    await testInfo.attach('single-image-removal-confirmation-mobile', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await confirmation.getByRole('button', { name: 'Remove image', exact: true }).click();
    await expect(
      page.getByRole('link', { name: `Open original image ${selected.id}` }),
    ).toHaveCount(0);
    const after = await read();
    expect(after.images.map((image) => image.id)).toEqual(
      before.images.slice(1).map((image) => image.id),
    );
    expect(after.history).toContainEqual(expect.objectContaining({ action: 'image_removed' }));
    for (const image of after.images) {
      await expect(
        page.getByRole('link', { name: `Open original image ${image.id}` }),
      ).toBeVisible();
      expect(image.originalUrl).not.toBeNull();
      // Fixture images share one object: deleting the selected row must retain it.
      expect((await context.request.get(image.originalUrl!)).ok()).toBeTruthy();
    }
    await page.reload();
    await page.getByRole('tab', { name: /in review by me/i }).click();
    await page.getByRole('button', { name: `Open review for ${target.title}` }).click();
    await expect(
      page.getByRole('link', { name: `Open original image ${selected.id}` }),
    ).toHaveCount(0);
    await testInfo.attach('single-image-removal-retained-images-mobile', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  } finally {
    await fixture.cleanup();
  }
});
