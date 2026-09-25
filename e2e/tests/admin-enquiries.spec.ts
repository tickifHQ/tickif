import { randomInt, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { db, eq, inArray, schema } from '@repo/db';
import {
  assertTestDb,
  makeDesigner,
  makeOrganization,
  makeProject,
  makeUser,
} from '@repo/db/testing';
import { signInPhone } from '../lib/auth';
import { webUrl } from '../lib/environment';

test('admin enquiries filter and paginate while non-admin accounts stay denied', async ({
  browser,
}) => {
  await assertTestDb();
  const suffix = randomUUID();
  const phone = (prefix: string) => `+91${prefix}${randomInt(10_000_000, 99_999_999)}`;
  const organization = await makeOrganization({ name: `Enquiry Admin Studio ${suffix}` });
  const designer = await makeUser({
    name: 'Enquiry Designer',
    email: `enquiry-designer-${suffix}@test.local`,
    phoneNumber: phone('91'),
    phoneNumberVerified: true,
    role: 'designer',
    status: 'active',
  });
  const designerProfile = await makeDesigner({
    userId: designer.id,
    orgId: organization.id,
    displayName: 'North Star Studio',
  });
  const referredProject = await makeProject({
    designerId: designerProfile.id,
    title: 'Sunlit Courtyard Home',
  });
  const requester = await makeUser({
    name: 'Asha Rao',
    email: `enquiry-requester-${suffix}@test.local`,
    phoneNumber: phone('92'),
    phoneNumberVerified: true,
    role: 'visitor',
    status: 'active',
  });
  const admin = await makeUser({
    name: 'Enquiry Admin',
    email: `enquiry-admin-${suffix}@test.local`,
    phoneNumber: phone('93'),
    phoneNumberVerified: true,
    role: 'admin',
    status: 'active',
  });

  const statusCounts = { open: 12, responded: 7, closed: 7 } as const;
  const enquiries = Object.entries(statusCounts).flatMap(([status, count], statusIndex) =>
    Array.from({ length: count }, (_, index) => ({
      requesterId: requester.id,
      designerProfileId: designerProfile.id,
      organizationId: organization.id,
      referredProjectId: index === 0 ? referredProject.id : null,
      subject: `${status} enquiry ${String(index + 1).padStart(2, '0')}`,
      description: `Synthetic ${status} enquiry for admin browser coverage.`,
      budget: index === 1 ? 'Not decided' : '₹10L–₹20L',
      timeline: index === 1 ? null : 'Within 3 months',
      status: status as 'open' | 'responded' | 'closed',
      createdAt: new Date(Date.UTC(2026, 8, 25 - statusIndex, 12, count - index)),
      updatedAt: new Date(Date.UTC(2026, 8, 26 - statusIndex, 12, count - index)),
    })),
  );
  await db.insert(schema.enquiry).values(enquiries);

  const adminContext = await browser.newContext({ baseURL: webUrl });
  const visitorContext = await browser.newContext({ baseURL: webUrl });
  await signInPhone(adminContext, admin.phoneNumber!);
  await signInPhone(visitorContext, requester.phoneNumber!);

  try {
    const page = await adminContext.newPage();
    await page.goto('/admin/enquiries?status=open&page=1&limit=10');

    await expect(page.getByRole('heading', { name: 'Enquiries' })).toBeVisible();
    await expect(page.getByText('open enquiry 01')).toBeVisible();
    await expect(page.getByText('Sunlit Courtyard Home')).toBeVisible();
    await expect(page.getByText('Page 1 of 2 · 12 enquiries')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('button', { name: /respond|close|assign/i })).toHaveCount(0);
    if (process.env.QA_SCREENSHOT_DIR) {
      await page.screenshot({
        path: `${process.env.QA_SCREENSHOT_DIR}/admin-enquiries-desktop.png`,
      });
    }

    await page.getByRole('link', { name: 'Next page' }).click();
    await expect(page).toHaveURL(/\/admin\/enquiries\?status=open&page=2&limit=10/);
    await expect(page.getByText('Page 2 of 2 · 12 enquiries')).toBeVisible();

    await page.getByRole('link', { name: 'Responded' }).click();
    await expect(page).toHaveURL(/\/admin\/enquiries\?page=1&limit=10&status=responded/);
    await expect(page.getByText('responded enquiry 02')).toBeVisible();
    await expect(page.getByText('Not specified')).toBeVisible();
    await expect(page.getByText('No referred project').first()).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('heading', { name: 'Enquiries' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    if (process.env.QA_SCREENSHOT_DIR) {
      await page.screenshot({
        path: `${process.env.QA_SCREENSHOT_DIR}/admin-enquiries-mobile.png`,
      });
    }

    await page.getByRole('button', { name: 'Open navigation' }).click();
    const mobileNav = page.getByRole('dialog', { name: 'Admin navigation' });
    await expect(mobileNav.getByRole('link', { name: 'Enquiries' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    if (process.env.QA_SCREENSHOT_DIR) {
      await expect
        .poll(() => mobileNav.evaluate((element) => getComputedStyle(element).opacity))
        .toBe('1');
      await page.screenshot({
        path: `${process.env.QA_SCREENSHOT_DIR}/admin-enquiries-mobile-navigation.png`,
      });
    }

    const visitorPage = await visitorContext.newPage();
    await visitorPage.goto('/admin/enquiries');
    await expect(visitorPage).toHaveURL(`${webUrl}/unauthorized`);
    await expect(visitorPage.getByRole('heading', { name: 'Access denied' })).toBeVisible();
  } finally {
    await Promise.allSettled([adminContext.close(), visitorContext.close()]);
    await assertTestDb();
    await db.delete(schema.organization).where(eq(schema.organization.id, organization.id));
    await db
      .delete(schema.user)
      .where(inArray(schema.user.id, [designer.id, requester.id, admin.id]));
  }
});
