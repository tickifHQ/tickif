import { randomInt, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { db, eq, schema } from '@repo/db';
import {
  assertTestDb,
  makeDesigner,
  makeProject,
  makeProjectImage,
  makeUser,
} from '@repo/db/testing';
import { deleteObject, putObject } from '@repo/storage';
import { apiUrl, webUrl } from '../lib/environment';
import { signInPhone } from '../lib/auth';
import { makePublicPortfolio } from '../lib/public-portfolio';

test('visitor follows a studio and sees real viewed and messaged enquiry milestones', async ({
  page,
  context,
  browser,
}, testInfo) => {
  test.setTimeout(150000);
  await assertTestDb();
  const phone = () => `+9196${randomInt(10000000, 99999999)}`;
  const visitor = await makeUser({
    role: 'visitor',
    status: 'active',
    name: 'Following Visitor',
    phoneNumber: phone(),
    phoneNumberVerified: true,
  });
  const owner = await makeUser({
    role: 'designer',
    status: 'active',
    name: 'Messaging Studio Owner',
    phoneNumber: phone(),
    phoneNumberVerified: true,
  });
  const key = `e2e/following/${randomUUID()}.jpg`;
  const studio = await makeDesigner({
    userId: owner.id,
    status: 'active',
    displayName: 'Following QA Studio',
    bio: 'A synthetic public studio for workflow checks.',
    logoImageId: key,
  });
  const portfolio = await makePublicPortfolio({
    profileId: studio.id,
    portfolioSlug: `following-${randomUUID().slice(0, 8)}`,
  });
  await db.insert(schema.member).values({
    id: `owner-${owner.id}`,
    userId: owner.id,
    organizationId: studio.orgId,
    role: 'owner',
    createdAt: new Date(),
  });
  const project = await makeProject({
    designerId: studio.id,
    status: 'published',
    publishedAt: new Date(),
    title: 'Following enquiry test project',
  });
  const olderProjects = await Promise.all(
    Array.from({ length: 24 }, (_, index) =>
      makeProject({
        designerId: studio.id,
        status: 'published',
        publishedAt: new Date(Date.now() - 172800000 - index * 1000),
        title: `Following older project ${index + 1}`,
      }),
    ),
  );
  const image = await makeProjectImage({
    projectId: project.id,
    originalKey: key,
    status: 'ready',
    isLive: true,
    width: 1280,
    height: 960,
    derivatives: [{ variant: 'large', format: 'jpeg', key, width: 1280, height: 960 }],
  });
  await db
    .update(schema.project)
    .set({ coverImageId: image.id })
    .where(eq(schema.project.id, project.id));
  const studioContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await putObject({
      key,
      contentType: 'image/jpeg',
      body: await readFile(
        resolve('../apps/web/public/images/home-hero/warm-pendant-living-room.jpg'),
      ),
    });
    await signInPhone(context, visitor.phoneNumber);
    await page.goto(`/image/${image.id}`);
    const follow = page.getByRole('button', { name: 'Follow Following QA Studio', exact: true });
    await expect(follow.locator('svg.lucide-user-plus')).toBeVisible();
    await expect(follow).toBeEnabled();
    await page.route(`**/api/following/${studio.id}`, (route) =>
      route.request().method() === 'PUT'
        ? route.fulfill({ status: 503, json: { error: { code: 'unavailable' } } })
        : route.continue(),
    );
    await follow.click();
    await expect(page.getByText('Could not update following. Please try again.')).toBeVisible();
    await page.unroute(`**/api/following/${studio.id}`);
    await follow.click();
    await expect(
      page.getByRole('button', { name: 'Unfollow Following QA Studio', exact: true }),
    ).toBeEnabled();
    const followingButton = page.getByRole('button', {
      name: 'Unfollow Following QA Studio',
      exact: true,
    });
    await expect(followingButton).toHaveCSS('height', '32px');
    await expect(followingButton).toHaveCSS(
      'box-shadow',
      /^(none|(?:rgba\(0, 0, 0, 0\) 0px 0px 0px 0px,? ?)+)$/,
    );
    await followingButton.hover();
    await expect(followingButton).toHaveText('Following');
    await expect(followingButton).toHaveCSS('clip-path', 'none');
    await followingButton.screenshot({ path: '/tmp/tickif-following-saved-pill.png' });
    await page.setViewportSize({ width: 320, height: 844 });
    await expect(followingButton).toBeVisible();
    const followingBounds = (await followingButton.boundingBox())!;
    expect(followingBounds.x).toBeGreaterThanOrEqual(0);
    expect(followingBounds.x + followingBounds.width).toBeLessThanOrEqual(320);
    await page.setViewportSize({ width: 1280, height: 900 });
    await db
      .update(schema.designerFollow)
      .set({ lastSeenAt: new Date(Date.now() - 86400000) })
      .where(eq(schema.designerFollow.userId, visitor.id));
    const enquiryResponse = await context.request.post(`${apiUrl}/api/enquiries`, {
      headers: { origin: webUrl },
      data: {
        designerProfileId: studio.id,
        referredProjectId: project.id,
        subject: 'Followed studio enquiry',
        description: 'Can you help with my home?',
        budget: '10l-20l',
      },
    });
    expect(enquiryResponse.ok()).toBeTruthy();
    const enquiry = await enquiryResponse.json();
    const [record] = await db
      .select()
      .from(schema.enquiry)
      .where(eq(schema.enquiry.id, enquiry.id));
    await page.goto('/home?feed=custom');
    const rail = page.getByRole('region', { name: 'Studios you follow' });
    const activity = page
      .getByRole('navigation', { name: 'Your activity' })
      .filter({ visible: true });
    await expect(
      activity.getByRole('link', { name: 'Enquiries 1 NEW', exact: true }),
    ).toBeVisible();
    await expect(
      rail.getByRole('link', { name: 'Following QA Studio, 1 new projects', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Your enquiry to Following QA Studio')).toBeVisible();
    const followingTab = page.getByRole('link', { name: 'Following 1', exact: true });
    await expect(followingTab).toBeVisible();
    await followingTab.click();
    await expect(page).toHaveURL(/view=following/);
    await expect(followingTab).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { name: project.title, exact: true })).toBeVisible();
    const privateFeed = await context.request.get(`${apiUrl}/api/following/feed`);
    expect(privateFeed.headers()['cache-control']).toBe('private, no-store');
    const feedBody = await privateFeed.json();
    expect(feedBody.items.map((item: { id: string }) => item.id)).toEqual([
      project.id,
      ...olderProjects.slice(0, 23).map((item) => item.id),
    ]);
    expect(feedBody.hasMore).toBe(true);
    let releasePage!: () => void;
    const pageGate = new Promise<void>((resolve) => {
      releasePage = resolve;
    });
    await page.route('**/api/following/feed?*', async (route) => {
      if (new URL(route.request().url()).searchParams.get('page') !== '2') return route.continue();
      await pageGate;
      return route.continue();
    });
    await page
      .getByRole('button', { name: 'Load more projects', exact: true })
      .scrollIntoViewIfNeeded();
    const loader = page.getByRole('status').filter({ hasText: 'Loading more homes for you' });
    await expect(loader).toBeVisible();
    await expect(loader.locator('svg.lucide-circle')).toHaveCount(3);
    await expect(loader.locator('svg').first()).toHaveCSS('width', '8px');
    await expect(loader.locator('span').first()).toHaveCSS('column-gap', '6px');
    await expect(loader.locator('span').last()).toHaveCSS('font-size', '11px');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(loader).toBeVisible();
    await loader.screenshot({ path: '/tmp/tickif-following-feed-loader.png' });
    releasePage();
    await expect(
      page.getByRole('heading', { name: olderProjects[23]!.title, exact: true }),
    ).toBeVisible();
    await expect(loader).toHaveCount(0);
    await page.unroute('**/api/following/feed?*');
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    const firstLogo = page
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name: project.title, exact: true }) })
      .locator('img[alt=""]');
    const originalLogoUrl = (await firstLogo.getAttribute('src'))!;
    const originalSignedAt = new URL(originalLogoUrl).searchParams.get('X-Amz-Date');
    expect(originalSignedAt).not.toBeNull();
    // Wait for a genuinely rotated server signature, not an arbitrary sleep.
    await expect
      .poll(async () => {
        const response = await context.request.get(`${apiUrl}/api/following/feed`);
        expect(response.ok()).toBeTruthy();
        const payload = await response.json();
        return new URL(payload.items[0].studioLogoUrl).searchParams.get('X-Amz-Date');
      })
      .not.toBe(originalSignedAt);
    const refreshedRoute = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === '/home' &&
        url.searchParams.get('view') === 'following' &&
        response.request().headers().rsc === '1' &&
        !response.request().headers()['next-router-prefetch']
      );
    });
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    expect((await refreshedRoute).ok()).toBeTruthy();
    await expect(firstLogo).not.toHaveAttribute('src', originalLogoUrl);
    await expect(page.getByRole('article')).toHaveCount(25);
    await expect(
      page.getByRole('heading', { name: olderProjects[23]!.title, exact: true }),
    ).toBeVisible();

    await page.getByRole('group', { name: 'Feed views' }).scrollIntoViewIfNeeded();
    for (const width of [320, 390, 768, 1512]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(followingTab).toBeVisible();
      const box = (await followingTab.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('button', { name: 'For you', exact: true }).click();
    await expect(page).not.toHaveURL(/view=following/);
    const summary = page.getByRole('link', { name: /Your enquiry to Following QA Studio/ });
    await expect(summary.getByText('NEW', { exact: true })).toBeVisible();
    const followingHeight = (await rail.boundingBox())!.height;
    await rail.getByRole('link', { name: 'Following QA Studio, 1 new projects' }).click();
    await expect(page).toHaveURL(new RegExp(`/d/${portfolio.portfolioSlug}`));
    const heroActions = page.getByRole('region', { name: 'Portfolio hero' });
    const shareActions = page.locator('#share');
    const profileFollowLabel = { name: 'Follow Following QA Studio', exact: true };
    const profileUnfollowLabel = { name: 'Unfollow Following QA Studio', exact: true };
    await expect(page.getByRole('button', profileUnfollowLabel)).toHaveCount(2);
    await expect(heroActions.getByRole('button', profileUnfollowLabel)).toHaveCSS('height', '50px');
    const heroOrder = await heroActions
      .getByRole('button', profileUnfollowLabel)
      .evaluate((element) => {
        const enquiry = element.parentElement!.parentElement!.querySelector(
          '[aria-label="Send an enquiry"]',
        )!;
        return Boolean(element.compareDocumentPosition(enquiry) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
    expect(heroOrder).toBe(true);
    await page.route(`**/api/following/${studio.id}`, (route) =>
      route.request().method() === 'DELETE'
        ? route.fulfill({ status: 503, json: { error: { code: 'unavailable' } } })
        : route.continue(),
    );
    await shareActions.getByRole('button', profileUnfollowLabel).click();
    await expect(page.getByText('Could not update following. Please try again.')).toHaveCount(2);
    await expect(page.getByRole('button', profileUnfollowLabel)).toHaveCount(2);
    await page.unroute(`**/api/following/${studio.id}`);
    await shareActions.getByRole('button', profileUnfollowLabel).click();
    await expect(page.getByRole('button', profileFollowLabel)).toHaveCount(2);
    await heroActions.getByRole('button', profileFollowLabel).click();
    await expect(page.getByRole('button', profileUnfollowLabel)).toHaveCount(2);
    for (const width of [320, 390, 768, 1512]) {
      await page.setViewportSize({ width, height: 900 });
      for (const section of [heroActions, shareActions]) {
        const action = section.getByRole('button', profileUnfollowLabel);
        await expect(action).toBeVisible();
        const box = (await action.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
      }
    }
    await heroActions.screenshot({
      path: '/tmp/tickif-profile-follow-hero.png',
      animations: 'disabled',
    });
    await shareActions.screenshot({
      path: '/tmp/tickif-profile-follow-share.png',
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect
      .poll(
        async () =>
          (await (await context.request.get(`${apiUrl}/api/following`)).json()).items[0]
            .newProjectCount,
      )
      .toBe(0);
    await page.goBack();
    await expect(rail.getByText('1 NEW', { exact: true })).toHaveCount(0);
    expect((await rail.boundingBox())!.height).toBe(followingHeight);
    await signInPhone(studioContext, owner.phoneNumber);
    expect(
      (
        await studioContext.request.post(`${apiUrl}/api/auth/organization/set-active`, {
          headers: { origin: webUrl },
          data: { organizationId: studio.orgId },
        })
      ).ok(),
    ).toBeTruthy();
    const studioPage = await studioContext.newPage();
    studioPage.on('pageerror', (error) => errors.push(error.message));
    await studioPage.goto(`/designer/leads?leadId=${record!.leadId}`);
    const dialog = studioPage.getByRole('dialog');
    await expect(dialog.getByLabel('Message the visitor')).toBeVisible();
    await expect
      .poll(
        async () =>
          (await db.select().from(schema.enquiry).where(eq(schema.enquiry.id, enquiry.id)))[0]
            ?.viewedAt,
      )
      .not.toBeNull();
    await page.reload();
    await expect(
      summary.getByRole('heading', { name: 'Viewed, complete', exact: true }),
    ).toBeVisible();
    await dialog
      .getByLabel('Message the visitor')
      .fill('We would love to help. Please share your floor plan.');
    await studioPage.route(`**/api/leads/${record!.leadId}/messages`, (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 503, json: { error: { code: 'unavailable' } } })
        : route.continue(),
    );
    await dialog.getByRole('button', { name: 'Send message' }).click();
    await expect(dialog.getByText(/Your draft is kept/)).toBeVisible();
    await studioPage.unroute(`**/api/leads/${record!.leadId}/messages`);
    await dialog.getByRole('button', { name: 'Send message' }).click();
    await expect(
      dialog.getByText('We would love to help. Please share your floor plan.', { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      summary.getByRole('heading', { name: 'Contacted, complete', exact: true }),
    ).toBeVisible();
    for (const width of [320, 375, 768, 1512]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await expect(summary).toBeVisible();
      await expect(rail).toBeVisible();
      if (width === 1512) {
        const card = await summary.boundingBox();
        const title = await page.getByRole('heading', { level: 1 }).boundingBox();
        expect(card!.height).toBeLessThanOrEqual(72);
        expect(card!.x).toBeGreaterThan(title!.x + title!.width);
      }
      await page.screenshot({
        path: testInfo.outputPath(`following-enquiry-${width}.png`),
        animations: 'disabled',
      });
    }
    await page.setViewportSize({ width: 320, height: 844 });
    const unreadActivityHeight = (await activity.boundingBox())!.height;
    await page.route('**/api/enquiries/*/read', (route) =>
      route.fulfill({
        status: 503,
        json: { error: { message: 'Please retry marking this read' } },
      }),
    );
    await summary.click();
    await expect(page).toHaveURL(new RegExp(`/enquiries\\?enquiryId=${enquiry.id}`));
    await expect(
      page.getByText('We would love to help. Please share your floor plan.', { exact: true }),
    ).toBeVisible();
    const unreadEntry = page.getByRole('button', { name: /Following QA Studio.*Unread updates/ });
    await expect(unreadEntry).toBeVisible();
    await expect(unreadEntry.locator('svg.lucide-circle')).toBeVisible();
    await expect(
      page.getByRole('status').filter({ hasText: 'Could not mark this enquiry' }),
    ).toBeVisible();
    await page.screenshot({ path: '/tmp/tickif-enquiry-unread-dot.png', animations: 'disabled' });
    await page.unroute('**/api/enquiries/*/read');
    await page
      .getByRole('region', { name: 'Studio messages' })
      .getByRole('button', { name: 'Retry' })
      .click();
    await expect(page.getByText('Unread updates', { exact: true })).toHaveCount(0);
    await expect
      .poll(
        async () =>
          (await (await context.request.get(`${apiUrl}/api/enquiries/mine`)).json()).items[0]
            .activity.isNew,
      )
      .toBe(false);
    await page.goBack();
    await expect(summary.getByText('NEW', { exact: true })).toHaveCount(0);
    expect((await activity.boundingBox())!.height).toBe(unreadActivityHeight);
    await expect(activity.getByRole('link', { name: 'Enquiries 1', exact: true })).toBeVisible();
    await page.screenshot({ path: '/tmp/tickif-enquiry-total-read.png', animations: 'disabled' });
    await dialog
      .getByLabel('Message the visitor')
      .fill('Another studio update after you read the first.');
    await dialog.getByRole('button', { name: 'Send message' }).click();
    await expect(
      dialog.getByText('Another studio update after you read the first.', { exact: true }),
    ).toBeVisible();
    const main = await page.locator('main').elementHandle();
    await expect
      .poll(
        async () =>
          (await (await context.request.get(`${apiUrl}/api/enquiries/counts`)).json()).unread,
      )
      .toBe(1);
    await page.bringToFront();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(
      activity.getByRole('link', { name: 'Enquiries 1 NEW', exact: true }),
    ).toBeVisible();
    expect(await main!.evaluate((element) => element.isConnected)).toBe(true);
    await page.route('**/api/enquiries/counts', (route) =>
      route.fulfill({ status: 503, json: { error: { code: 'unavailable' } } }),
    );
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(activity.getByRole('button', { name: 'Retry enquiry count' })).toBeVisible();
    await expect(activity.getByRole('link', { name: 'Enquiries', exact: true })).toBeVisible();
    for (const width of [320, 375, 768, 1512]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(activity.getByRole('button', { name: 'Retry enquiry count' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    await page.unroute('**/api/enquiries/counts');
    await activity.getByRole('button', { name: 'Retry enquiry count' }).click();
    await expect(
      activity.getByRole('link', { name: 'Enquiries 1 NEW', exact: true }),
    ).toBeVisible();
    expect(await main!.evaluate((element) => element.isConnected)).toBe(true);
    await summary.click();
    await expect(
      page.getByText('Another studio update after you read the first.', { exact: true }),
    ).toBeVisible();
    await expect
      .poll(
        async () =>
          (await (await context.request.get(`${apiUrl}/api/enquiries/counts`)).json()).unread,
      )
      .toBe(0);
    await page.goBack();
    await expect(activity.getByRole('link', { name: 'Enquiries 1', exact: true })).toBeVisible();
    await page.goto(`/image/${image.id}`);
    await page.getByRole('button', { name: 'Unfollow Following QA Studio', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Follow Following QA Studio', exact: true }),
    ).toBeEnabled();
    await page.goto('/home?feed=custom');
    await expect(rail.getByRole('link', { name: /Following QA Studio/ })).toHaveCount(0);
    await page.getByRole('link', { name: 'Following 0', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'No followed projects yet' })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await studioContext.close();
    await db.delete(schema.project).where(eq(schema.project.id, project.id));
    for (const older of olderProjects)
      await db.delete(schema.project).where(eq(schema.project.id, older.id));
    await db.delete(schema.designerProfile).where(eq(schema.designerProfile.id, studio.id));
    await db.delete(schema.organization).where(eq(schema.organization.id, studio.orgId));
    await db.delete(schema.user).where(eq(schema.user.id, owner.id));
    await db.delete(schema.user).where(eq(schema.user.id, visitor.id));
    await deleteObject(key);
  }
});
