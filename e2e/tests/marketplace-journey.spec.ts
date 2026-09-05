import { randomInt, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { apiUrl, webUrl } from '../lib/environment';
import { phoneCode, signInPhone } from '../lib/auth';
import { db, eq, inArray, schema } from '@repo/db';
import { assertTestDb, makeUser } from '@repo/db/testing';
import { deleteObject } from '@repo/storage';
import { deleteSearchDocument } from '@repo/search';
import {
  listProjectImagesResponseSchema,
  onboardDesignerResponseSchema,
  projectDetailResponseSchema,
  projectRoomSchema,
} from '@repo/contracts';

test('designer onboarding and media processing connects to visitor onboarding and discovery, enquiry and lead management', async ({
  browser,
}, testInfo) => {
  // This is one sequential journey across three independently authenticated participants.
  test.setTimeout(180_000);
  await assertTestDb();
  const suffix = randomUUID().slice(0, 8);
  const owner = await makeUser({
    name: 'New Studio Owner',
    email: `owner-${suffix}@test.local`,
    role: 'visitor',
    status: 'active',
    phoneNumber: `+9191${randomInt(10_000_000, 99_999_999)}`,
    phoneNumberVerified: true,
  });
  const admin = await makeUser({
    name: 'Journey Moderator',
    role: 'admin',
    status: 'active',
    phoneNumber: `+9192${randomInt(10_000_000, 99_999_999)}`,
    phoneNumberVerified: true,
  });
  const visitorPhone = `+9193${randomInt(10_000_000, 99_999_999)}`;
  const designerContext = await browser.newContext({ baseURL: webUrl });
  const visitorContext = await browser.newContext({ baseURL: webUrl });
  const adminContext = await browser.newContext({ baseURL: webUrl });
  const designer = await designerContext.newPage();
  const visitor = await visitorContext.newPage();
  const moderator = await adminContext.newPage();
  const headers = { origin: webUrl };
  let orgId: string | undefined;
  let projectId: string | undefined;
  let profileId: string | undefined;
  const objectKeys: string[] = [];
  try {
    await signInPhone(designerContext, owner.phoneNumber);
    await designer.goto('/designer/onboarding');
    await designer.getByRole('button', { name: /Just me/ }).click();
    await designer.getByLabel('Display name', { exact: true }).fill(`Journey Studio ${suffix}`);
    await designer.getByLabel('Address', { exact: true }).fill('Bandra, Mumbai');
    await designer.getByRole('button', { name: 'Continue', exact: true }).click();
    const onboardingResponse = designer.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().endsWith('/api/profiles/me'),
    );
    await designer.getByRole('button', { name: 'Continue', exact: true }).click();
    const onboarded = onboardDesignerResponseSchema.parse(await (await onboardingResponse).json());
    orgId = onboarded.organization.id;
    profileId = onboarded.profile.id;
    await expect(designer.getByRole('button', { name: 'Add your projects' })).toBeVisible();
    await designer.getByRole('button', { name: 'Add your projects' }).click();
    await expect(designer).toHaveURL(/\/designer\/projects\/new/);

    // Metadata setup uses the same authenticated public API as the editor; uploads and
    // submission are exercised through the rendered editor, with an actual BullMQ worker.
    const create = await designerContext.request.post(`${apiUrl}/api/projects`, {
      headers,
      data: {
        title: `Journey Home ${suffix}`,
        citySlug: 'mumbai',
        propertyTypeSlug: 'apartment',
        scopeSlug: 'full-home',
        budgetBandSlug: 'premium',
      },
    });
    expect(create.ok(), await create.text()).toBeTruthy();
    const project = projectDetailResponseSchema.parse(await create.json());
    projectId = project.id;
    const [roomType] = await db
      .select()
      .from(schema.taxonomy)
      .where(eq(schema.taxonomy.kind, 'room'))
      .limit(1);
    if (!roomType) throw new Error('Seeded room taxonomy is missing');
    const roomResponse = await designerContext.request.post(
      `${apiUrl}/api/projects/${project.id}/rooms`,
      { headers, data: { roomTypeId: roomType.id, name: 'Living room' } },
    );
    expect(roomResponse.ok(), await roomResponse.text()).toBeTruthy();
    const room = projectRoomSchema.parse(await roomResponse.json());
    await designer.goto(`/designer/projects/${project.id}/edit`);
    await designer
      .locator('input[type="file"]')
      .first()
      .setInputFiles([
        resolve('../apps/web/public/images/home-hero/warm-pendant-living-room.jpg'),
        resolve('../apps/web/public/images/home-hero/neutral-living-room.jpg'),
        resolve('../apps/web/public/images/home-hero/gallery-wall-living-room.jpg'),
      ]);
    const readImages = async () =>
      listProjectImagesResponseSchema.parse(
        await (
          await designerContext.request.get(`${apiUrl}/api/projects/${project.id}/images`)
        ).json(),
      ).items;
    await expect
      .poll(async () => (await readImages()).filter((image) => image.status === 'ready').length, {
        timeout: 45_000,
        message: 'Real worker finishes all three uploaded originals and derivatives',
      })
      .toBe(3);
    for (const image of await readImages()) {
      expect(image.derivatives.length).toBeGreaterThan(1);
      expect(image.width).toBeGreaterThan(0);
      expect(image.previewUrl).not.toBeNull();
      const download = await designerContext.request.get(image.previewUrl!);
      expect(
        download.ok(),
        'Generated derivative is present in actual object storage',
      ).toBeTruthy();
      expect(download.headers()['content-type']).toMatch(/^image\//);
      objectKeys.push(...image.derivatives.map((derivative) => derivative.key));
      const metadata = await designerContext.request.patch(
        `${apiUrl}/api/media/${image.id}/metadata`,
        { headers, data: { roomId: room.id, themeSlugs: ['modern'], finishSlugs: ['veneer'] } },
      );
      expect(metadata.ok(), await metadata.text()).toBeTruthy();
    }
    const originals = await db
      .select({ key: schema.projectImage.originalKey })
      .from(schema.projectImage)
      .where(eq(schema.projectImage.projectId, project.id));
    objectKeys.push(...originals.map((image) => image.key));
    await designer.reload();
    await designer.getByRole('button', { name: 'Preview & Submit Project' }).click();
    await expect
      .poll(
        async () =>
          projectDetailResponseSchema.parse(
            await (
              await designerContext.request.get(`${apiUrl}/api/projects/${project.id}`)
            ).json(),
          ).status,
      )
      .toBe('submitted');
    await signInPhone(adminContext, admin.phoneNumber);
    await moderator.goto('/moderation');
    await moderator.getByRole('button', { name: `Open review for ${project.title}` }).click();
    await moderator.getByRole('button', { name: 'Start review', exact: true }).click();
    await moderator.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect
      .poll(
        async () =>
          projectDetailResponseSchema.parse(
            await (
              await designerContext.request.get(`${apiUrl}/api/projects/${project.id}`)
            ).json(),
          ).status,
      )
      .toBe('published');

    await visitor.goto('/login');
    await visitor.getByPlaceholder('9123456789').fill(visitorPhone.slice(3));
    await visitor.getByRole('button', { name: 'Get OTP', exact: true }).click();
    await expect(visitor.getByRole('textbox', { name: 'OTP digit 1', exact: true })).toBeVisible();
    await visitor
      .getByRole('textbox', { name: 'OTP digit 1', exact: true })
      .fill(await phoneCode(visitorPhone));
    await visitor.getByRole('button', { name: 'Continue', exact: true }).click();
    await visitor.getByLabel('Display name', { exact: true }).fill(`Journey Visitor ${suffix}`);
    await visitor.getByLabel('Address', { exact: true }).fill('Mumbai');
    await visitor.getByRole('checkbox', { name: 'Use phone number for WhatsApp' }).check();
    await visitor.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(visitor).toHaveURL(`${webUrl}/`);
    const [persistedVisitor] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.phoneNumber, visitorPhone));
    expect(persistedVisitor?.name).toBe(`Journey Visitor ${suffix}`);
    await visitor.goto(`/designers?q=${encodeURIComponent(`Journey Studio ${suffix}`)}`);
    await expect(
      visitor.getByRole('link', { name: new RegExp(`Journey Studio ${suffix}`) }).first(),
    ).toBeVisible({ timeout: 20_000 });
    await visitor
      .getByRole('link', { name: new RegExp(`Journey Studio ${suffix}`) })
      .first()
      .click();
    await expect(visitor).toHaveURL(/\/d\//);
    await visitor.goto(`/projects/${project.id}`);
    await visitor.getByRole('button', { name: 'Like project', exact: true }).click();
    await visitor.getByRole('button', { name: 'Save project', exact: true }).click();
    await visitor.reload();
    await expect(
      visitor.getByRole('button', { name: 'Unlike project', exact: true }),
    ).toBeVisible();
    await expect(
      visitor.getByRole('button', { name: 'Remove saved project', exact: true }),
    ).toBeVisible();
    await visitor.getByRole('button', { name: 'Enquire', exact: true }).first().click();
    const enquiry = visitor.getByRole('dialog', { name: 'Send an Enquiry' });
    await enquiry
      .getByLabel('Description', { exact: false })
      .fill(`Please discuss the kitchen renovation for synthetic household ${suffix}.`);
    await enquiry.getByRole('button', { name: 'Send Enquiry', exact: true }).click();
    await expect(enquiry.getByText('Enquiry sent successfully!')).toBeVisible();
    await designer.goto('/designer/leads');
    await expect(designer.getByText(`Journey Visitor ${suffix}`, { exact: true })).toBeVisible();
    await designer
      .getByRole('button', { name: `More actions for Journey Visitor ${suffix}` })
      .click();
    await designer.getByRole('menuitem', { name: 'Contacted', exact: true }).click();
    await designer.reload();
    await expect(
      designer.getByRole('row').filter({ hasText: `Journey Visitor ${suffix}` }),
    ).toContainText('Contacted');
    await designer.screenshot({
      path: testInfo.outputPath('processed-project-lead.png'),
      fullPage: true,
    });
    await designer.goto('/designer/billing');
    await expect(designer.getByText('Hobby', { exact: true }).first()).toBeVisible();
  } finally {
    await Promise.all([designerContext.close(), visitorContext.close(), adminContext.close()]);
    await assertTestDb();
    if (projectId) {
      await db
        .delete(schema.projectReviewComment)
        .where(eq(schema.projectReviewComment.projectId, projectId));
      await db
        .delete(schema.projectModerationEvent)
        .where(eq(schema.projectModerationEvent.projectId, projectId));
      await deleteSearchDocument('projects', projectId);
    }
    if (profileId) await deleteSearchDocument('designers', profileId);
    if (orgId) await db.delete(schema.organization).where(eq(schema.organization.id, orgId));
    await db.delete(schema.user).where(inArray(schema.user.id, [owner.id, admin.id]));
    await db.delete(schema.user).where(eq(schema.user.phoneNumber, visitorPhone));
    for (const key of objectKeys) await deleteObject(key);
  }
});
