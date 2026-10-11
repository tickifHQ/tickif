import { randomInt, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { db, eq, schema, sql } from '@repo/db';
import { assertTestDb, makeDesigner, makeOrganization, makeUser } from '@repo/db/testing';
import { deleteObject, listObjectKeys } from '@repo/storage';
import { signInPhone } from '../lib/auth';
import { apiUrl, webUrl } from '../lib/environment';

test('first upload preserves the workspace scroll position while creating a draft', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(180_000);
  await assertTestDb();
  await page.setViewportSize({ width: 1512, height: 944 });
  const owner = await makeUser({
    role: 'designer',
    status: 'active',
    phoneNumber: `+9193${randomInt(10_000_000, 99_999_999)}`,
    phoneNumberVerified: true,
  });
  const org = await makeOrganization();
  const profile = await makeDesigner({ userId: owner.id, orgId: org.id, status: 'active' });
  await db.insert(schema.member).values({
    id: randomUUID(),
    organizationId: org.id,
    userId: owner.id,
    role: 'owner',
    createdAt: new Date(),
  });
  let releaseUpload!: () => void;
  const uploadGate = new Promise<void>((resolve) => {
    releaseUpload = resolve;
  });
  let uploading = false;
  let releaseProject!: () => void;
  const projectGate = new Promise<void>((resolve) => {
    releaseProject = resolve;
  });
  try {
    await signInPhone(context, owner.phoneNumber);
    expect(
      (
        await context.request.put(`${apiUrl}/api/orgs/context`, {
          headers: { origin: webUrl },
          data: { kind: 'organization', organizationId: org.id },
        })
      ).status(),
    ).toBe(200);
    await page.goto('/designer/projects/upload');
    await expect(page.getByRole('button', { name: 'Apartment', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Step 2', exact: false }).click();
    await page.getByRole('button', { name: 'Step 3 Project metadata', exact: false }).click();
    await page.getByRole('button', { name: 'Step 4 Project images', exact: false }).click();
    await page.getByLabel('Project name', { exact: true }).fill('Scroll fixture home');
    const section = page.getByRole('button', { name: 'Step 4 Project images', exact: false });
    const main = page.getByRole('main');
    await main.evaluate(async (element) => {
      await Promise.all(
        element
          .getAnimations({ subtree: true })
          .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
          .map((animation) => animation.finished.catch(() => undefined)),
      );
    });
    const firstTile = page.getByRole('listitem', {
      name: 'warm-pendant-living-room.jpg',
      exact: true,
    });
    await section.evaluate((node) => {
      const scroller = node.closest('main')!;
      scroller.scrollTop += node.getBoundingClientRect().top - 183;
    });
    const geometry = async () => ({
      scrollTop: await main.evaluate((node) => node.scrollTop),
      sectionY: (await section.boundingBox())!.y,
    });
    const assertPosition = (
      position: Awaited<ReturnType<typeof geometry>>,
      baseline: Awaited<ReturnType<typeof geometry>>,
    ) => {
      // Browser focus/scroll anchoring can round at a one-CSS-pixel boundary.
      expect(Math.abs(position.scrollTop - baseline.scrollTop)).toBeLessThanOrEqual(1);
      expect(Math.abs(position.sectionY - baseline.sectionY)).toBeLessThanOrEqual(1);
    };
    const before = await geometry();
    expect(before.scrollTop).toBeGreaterThan(500);
    await page.screenshot({ path: testInfo.outputPath('before-upload.png') });
    // Separate picker focus, local previews, URL creation, and worker completion.
    // Holding requests changes timing only; all requests still reach the real API/storage.
    await page.route(`${apiUrl}/api/projects`, async (route) => {
      if (route.request().method() === 'POST') await projectGate;
      await route.continue();
    });
    await page.route('**/originals/**', async (route) => {
      if (route.request().method() === 'PUT') {
        uploading = true;
        await uploadGate;
      }
      await route.continue();
    });
    const pickerOpened = page.waitForEvent('filechooser');
    await page.getByText('Upload Files', { exact: true }).first().click();
    const picker = await pickerOpened;
    const pickerOpen = await geometry();
    assertPosition(pickerOpen, before);
    await picker.setFiles([
      resolve('../apps/web/public/images/home-hero/warm-pendant-living-room.jpg'),
      resolve('../apps/web/public/images/home-hero/neutral-living-room.jpg'),
      resolve('../apps/web/public/images/home-hero/gallery-wall-living-room.jpg'),
    ]);
    await expect(firstTile).toContainText('Queued');
    const queued = await geometry();
    assertPosition(queued, before);
    const firstTileNode = await firstTile.elementHandle();
    if (!firstTileNode) throw new Error('Local preview is missing before draft creation');
    const queuedTileY = (await firstTile.boundingBox())!.y;
    releaseProject();
    await expect.poll(() => uploading).toBe(true);
    await expect(page).toHaveURL(/projectId=/);
    const after = await geometry();
    const createdTileY = (await firstTile.boundingBox())!.y;
    expect(await firstTileNode.evaluate((node) => node.isConnected)).toBe(true);
    expect(Math.abs(createdTileY - queuedTileY)).toBeLessThanOrEqual(1);
    await firstTileNode.dispose();
    await page.screenshot({ path: testInfo.outputPath('after-upload.png') });
    assertPosition(after, before);
    releaseUpload();
    for (const name of [
      'warm-pendant-living-room.jpg',
      'neutral-living-room.jpg',
      'gallery-wall-living-room.jpg',
    ]) {
      await expect(page.getByRole('listitem', { name, exact: true })).toContainText('Ready', {
        timeout: 90_000,
      });
    }
    const ready = await geometry();
    assertPosition(ready, before);
    const evidencePath = testInfo.outputPath('upload-geometry.json');
    await writeFile(
      evidencePath,
      JSON.stringify(
        { before, pickerOpen, queued, after, ready, queuedTileY, createdTileY },
        null,
        2,
      ),
    );
    await testInfo.attach('upload-geometry', {
      path: evidencePath,
      contentType: 'application/json',
    });
  } finally {
    releaseProject();
    releaseUpload();
    await context.close();
    await assertTestDb();
    // An assertion can fail while the worker is still writing derivatives. Wait
    // for its shared organization lease, then remove rows under the exclusive
    // lease so queued workers re-read missing images instead of creating orphans.
    const projects = await db.transaction(async (tx) => {
      await tx.execute(sql`set local lock_timeout = '90s'`);
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`organization-retention:${org.id}`}, 0))`,
      );
      const ownedProjects = await tx
        .select({ id: schema.project.id })
        .from(schema.project)
        .where(eq(schema.project.designerId, profile.id));
      await tx.delete(schema.organization).where(eq(schema.organization.id, org.id));
      return ownedProjects;
    });
    for (const project of projects) {
      for (const prefix of [`originals/${project.id}/`, `derivatives/${project.id}/`]) {
        for (const key of await listObjectKeys(prefix)) await deleteObject(key);
      }
    }
    await db.delete(schema.user).where(eq(schema.user.id, owner.id));
  }
});
