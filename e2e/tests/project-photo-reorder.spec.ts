import '../lib/environment';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { db, eq, schema } from '@repo/db';
import { deleteObject, putObject } from '@repo/storage';
import { listProjectImagesResponseSchema } from '@repo/contracts';
import { createProjectVersionFixture } from '../lib/project-version-fixtures';
import { moderationApiUrl, signInProjectAdmin } from '../lib/project-moderation-fixtures';
import { webUrl } from '../lib/environment';

async function dragPhoto(page: Page, from: number, to: number, touch: boolean) {
  const photoButtons = page.getByRole('button', { name: /^Open Image/ });
  await photoButtons.nth(from).scrollIntoViewIfNeeded();
  const start = await photoButtons.nth(from).boundingBox();
  const target = await photoButtons.nth(to).boundingBox();
  if (!start || !target) throw new Error('Photos to reorder are missing.');
  const x = start.x + start.width / 2;
  const y = start.y + start.height / 2;
  const endX = target.x + target.width / 2;
  const endY = target.y + target.height / 2;
  if (touch) {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await page.waitForTimeout(300);
    for (let step = 1; step <= 20; step++) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: x + ((endX - x) * step) / 20, y: y + ((endY - y) * step) / 20 }],
      });
      await page.waitForTimeout(25);
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 20 });
    await page.mouse.up();
  }
}

for (const phone of [false, true]) {
  test(`photo ordering persists with ${phone ? 'phone touch' : 'desktop mouse and keyboard'}`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(120_000);
    const context = await browser.newContext({
      baseURL: webUrl,
      viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      isMobile: phone,
      hasTouch: phone,
      recordVideo: {
        dir: testInfo.outputPath('videos'),
        size: phone ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      },
    });
    const fixture = await createProjectVersionFixture();
    const keys: string[] = [];
    const page = await context.newPage();
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    try {
      const projectId = fixture.target.id;
      const photos = await db
        .select()
        .from(schema.projectImage)
        .where(eq(schema.projectImage.projectId, projectId));
      const names = [
        'warm-pendant-living-room',
        'bright-kitchen-living-room',
        'neutral-living-room',
      ];
      for (const [index, photo] of photos.entries()) {
        const key = `photo-reorder/${projectId}/${index}.jpg`;
        keys.push(key);
        await putObject({
          key,
          body: await readFile(
            new URL(`../../apps/web/public/images/home-hero/${names[index]}.jpg`, import.meta.url),
          ),
          contentType: 'image/jpeg',
        });
        await db
          .update(schema.projectImage)
          .set({
            sortOrder: index,
            width: 1200,
            height: 900,
            derivatives: [{ key, variant: 'thumb', format: 'jpeg', width: 1200, height: 900 }],
          })
          .where(eq(schema.projectImage.id, photo.id));
      }
      await db
        .update(schema.project)
        .set({ status: 'draft', coverImageId: photos[0]!.id })
        .where(eq(schema.project.id, projectId));
      await db
        .update(schema.projectRoom)
        .set({ name: 'Living room' })
        .where(eq(schema.projectRoom.projectId, projectId));
      await signInProjectAdmin(context, fixture.owner.phoneNumber);
      const active = await context.request.post(
        `${moderationApiUrl}/api/auth/organization/set-active`,
        { headers: { origin: webUrl }, data: { organizationId: fixture.organization.id } },
      );
      expect(active.ok()).toBeTruthy();
      const readOrder = async () => {
        const response = await context.request.get(
          `${moderationApiUrl}/api/projects/${projectId}/images`,
        );
        expect(response.ok()).toBeTruthy();
        return listProjectImagesResponseSchema
          .parse(await response.json())
          .items.map((image) => image.id);
      };
      await page.goto(`/designer/projects/upload?projectId=${projectId}`);
      await expect(page.getByRole('button', { name: 'Open Image 1', exact: true })).toBeVisible();
      const grid = page.getByRole('list', { name: 'Living room photos' });
      await grid.scrollIntoViewIfNeeded();
      await expect(grid.getByRole('listitem')).toHaveCount(3);
      await expect(page.getByText('Drag images to reorder photos', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: /^Reorder Image/ })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Move Image .* earlier/ })).toHaveCount(0);
      if (phone) {
        const preview = grid.getByRole('button', { name: 'Open Image 1', exact: true });
        await preview.scrollIntoViewIfNeeded();
        const before = await preview.boundingBox();
        if (!before) throw new Error('Photo preview is missing.');
        const touch = await context.newCDPSession(page);
        const x = before.x + 30;
        const y = before.y + before.height / 2;
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x, y }],
        });
        for (let step = 1; step <= 10; step++) {
          await touch.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x, y: y - step * 10 }],
          });
          await page.waitForTimeout(25);
        }
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await expect.poll(async () => (await preview.boundingBox())!.y).toBeLessThan(before.y - 30);
        expect(await readOrder()).toEqual(photos.map((photo) => photo.id));
        await touch.detach();
      }
      await dragPhoto(page, 0, phone ? 1 : 2, phone);
      const reordered = phone
        ? [photos[1]!.id, photos[0]!.id, photos[2]!.id]
        : [photos[1]!.id, photos[2]!.id, photos[0]!.id];
      await expect.poll(readOrder).toEqual(reordered);
      await expect(page.getByText('Saving order…')).toHaveCount(0);
      // Reordering leaves the selected cover attached to the same photo.
      await expect(grid.getByRole('button', { name: 'Image 1 is the cover' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await page.reload();
      await expect(grid.getByRole('listitem')).toHaveCount(3);
      await expect.poll(readOrder).toEqual(reordered);
      await expect(
        grid.getByRole('button', { name: `Image ${phone ? 2 : 3} is the cover` }),
      ).toBeVisible();
      if (!phone) {
        const first = page.getByRole('button', { name: 'Open Image 1', exact: true });
        await first.focus();
        await page.keyboard.press('Space');
        await expect(first).toHaveAttribute('aria-pressed', 'true');
        // Active state precedes dnd-kit's measurement of the initial drop target.
        await expect(page.getByText('Move to position 1 of 3.', { exact: true })).toBeAttached();
        await page.keyboard.press('ArrowRight');
        await expect(page.getByText('Move to position 2 of 3.', { exact: true })).toBeAttached();
        await page.keyboard.press('Escape');
        await expect(first).not.toHaveAttribute('aria-pressed', 'true');
        expect(await readOrder()).toEqual(reordered);
        // Cancellation restores the order before the cards finish moving back.
        // Start the next keyboard drag only once its target geometry is stable.
        await expect
          .poll(() =>
            grid
              .getByRole('listitem')
              .evaluateAll((items) =>
                items.every((item) =>
                  item.getAnimations().every((animation) => animation.playState !== 'running'),
                ),
              ),
          )
          .toBe(true);
        await first.focus();
        await page.keyboard.press('Space');
        await expect(first).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByText('Move to position 1 of 3.', { exact: true })).toBeAttached();
        await page.keyboard.press('ArrowRight');
        await expect(page.getByText('Move to position 2 of 3.', { exact: true })).toBeAttached();
        await page.keyboard.press('Space');
        await expect.poll(readOrder).toEqual([reordered[1], reordered[0], reordered[2]]);
        await expect(first).toBeFocused();
      }
      await grid.getByRole('button', { name: 'Set Image 1 as cover', exact: true }).click();
      await expect(grid.getByRole('button', { name: 'Image 1 is the cover' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await page.getByRole('button', { name: 'Save as draft', exact: true }).click();
      await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible();
      const photo = grid.getByRole('button', { name: 'Open Image 1', exact: true });
      if (phone) await photo.tap();
      else {
        await photo.focus();
        await page.keyboard.press('Enter');
      }
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByRole('button', { name: 'Close image preview', exact: true }).click();
      await grid.getByRole('button', { name: 'Remove Image 1', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(grid.getByRole('listitem')).toHaveCount(3);
      await grid.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: testInfo.outputPath(phone ? 'phone-photos.png' : 'desktop-photos.png'),
      });
      if (!phone) {
        await grid
          .locator('..')
          .screenshot({ path: testInfo.outputPath('desktop-photo-cards.png') });
      }
      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    } finally {
      await context.close();
      await fixture.cleanup();
      await Promise.all(keys.map(deleteObject));
    }
  });
}
