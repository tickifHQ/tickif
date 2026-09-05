import { expect, test, type BrowserContext } from '@playwright/test';
import { config } from '../../packages/config/src/index';
import { db, eq, schema } from '../../packages/db/src/index';
import {
  assertTestDb,
  makeDesigner,
  makeOrganization,
  makeProject,
  makeUser,
} from '../../packages/db/src/testing';

const apiUrl = config.NEXT_PUBLIC_API_URL;
async function signIn(context: BrowserContext, phoneNumber: string) {
  expect(
    (
      await context.request.post(`${apiUrl}/api/auth/phone-number/send-otp`, {
        data: { phoneNumber },
      })
    ).ok(),
  ).toBeTruthy();
  const [otp] = await db
    .select()
    .from(schema.verification)
    .where(eq(schema.verification.identifier, phoneNumber));
  const code = otp?.value.match(/^\d{4,8}/)?.[0];
  expect(code).toBeTruthy();
  expect(
    (
      await context.request.post(`${apiUrl}/api/auth/phone-number/verify`, {
        data: { phoneNumber, code },
      })
    ).ok(),
  ).toBeTruthy();
}

test('visitor books, studio confirms and completes, visitor reviews and cancels another request', async ({
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(180000);
  await assertTestDb();
  const visitorUser = await makeUser({
    name: 'Consultation Journey Visitor',
    email: 'consultation-visitor@example.test',
    phoneNumber: '+919800009901',
    phoneNumberVerified: true,
    status: 'active',
  });
  const owner = await makeUser({
    name: 'Consultation Journey Owner',
    email: 'consultation-owner@example.test',
    phoneNumber: '+919800009902',
    phoneNumberVerified: true,
    role: 'designer',
    status: 'active',
  });
  const org = await makeOrganization({
    name: 'Consultation Journey Studio',
    slug: 'consultation-journey-studio',
  });
  const profile = await makeDesigner({
    userId: owner.id,
    orgId: org.id,
    slug: org.slug,
    displayName: org.name,
    status: 'active',
    phone: owner.phoneNumber,
  });
  await db
    .insert(schema.member)
    .values({
      id: 'consultation-journey-owner',
      organizationId: org.id,
      userId: owner.id,
      role: 'owner',
      createdAt: new Date(),
    });
  const project = await makeProject({
    designerId: profile.id,
    title: 'Consultation Journey Kitchen',
    status: 'published',
  });
  const visitorContext = await browser.newContext({ baseURL });
  const designerContext = await browser.newContext({ baseURL });
  const visitor = await visitorContext.newPage();
  const designer = await designerContext.newPage();
  const pageErrors: string[] = [];
  visitor.on('pageerror', (error) => pageErrors.push(error.message));
  designer.on('pageerror', (error) => pageErrors.push(error.message));
  try {
    await signIn(visitorContext, visitorUser.phoneNumber!);
    await signIn(designerContext, owner.phoneNumber!);
    expect(
      (
        await designerContext.request.post(`${apiUrl}/api/auth/organization/set-active`, {
          data: { organizationId: org.id },
        })
      ).ok(),
    ).toBeTruthy();
    expect(
      (
        await designerContext.request.post(`${apiUrl}/api/auth/organization/set-active-team`, {
          data: { teamId: profile.teamId },
        })
      ).ok(),
    ).toBeTruthy();
    await visitor.goto(`/d/${profile.slug}`);
    await visitor.getByRole('button', { name: 'Book consultation', exact: true }).click();
    await visitor.getByRole('button', { name: 'Add another time' }).click();
    await visitor.getByLabel('Time window 2').selectOption('afternoon');
    await visitor
      .getByLabel('What would you like to discuss? (optional)')
      .fill('Planning our kitchen renovation.');
    await visitor.getByRole('button', { name: 'Request consultation', exact: true }).click();
    await expect(
      visitor.getByRole('status').filter({ hasText: 'Consultation requested' }),
    ).toBeVisible();
    await visitor.getByRole('link', { name: 'View my consultations' }).click();
    await expect(visitor.getByText('Awaiting confirmation', { exact: true })).toBeVisible();
    await visitor.reload();
    await expect(visitor.getByText('Planning our kitchen renovation.')).toBeVisible();
    // Keep this requester screen stale while the designer confirms the appointment.
    await designer.goto('/designer/consultations?status=requested');
    await expect(
      designer.getByText(/Private contact: consultation-visitor@example.test/),
    ).toBeVisible();
    await designer.getByLabel('Confirm preferred time').selectOption('1');
    await designer.getByRole('button', { name: 'Confirm consultation', exact: true }).click();
    await expect(designer.getByText('No consultations match this status.')).toBeVisible();
    await visitor.getByRole('button', { name: 'Cancel consultation', exact: true }).click();
    await visitor.getByLabel('Cancellation reason').fill('Stale cancellation should be rejected');
    await visitor.getByRole('button', { name: 'Confirm cancellation' }).click();
    await expect(visitor.getByRole('alert')).toContainText('Booking changed');
    await visitor.getByRole('button', { name: 'Reload consultations' }).click();
    await expect(visitor.getByText(/Confirmed: .*afternoon IST/)).toBeVisible();
    await designer.getByRole('link', { name: 'confirmed', exact: true }).click();
    await designer.getByRole('button', { name: 'Mark completed' }).click();
    await designer.getByRole('button', { name: 'Confirm completion' }).click();
    await expect(designer.getByText('No consultations match this status.')).toBeVisible();
    await visitor.reload();
    const reviewLink = visitor.getByRole('link', { name: 'Review consultation' });
    await expect(reviewLink).toHaveAttribute(
      'href',
      /\/d\/consultation-journey-studio\?bookingId=.*#tickif-reviews/,
    );
    await reviewLink.click();
    await expect(
      visitor.getByText('Your completed consultation will be checked when you submit.'),
    ).toBeVisible();
    await visitor.getByLabel('Your rating').selectOption('5');
    await visitor.getByRole('button', { name: 'Submit review' }).click();
    await expect(visitor.getByRole('region', { name: 'Your review' })).toContainText('pending');
    // A second request from a project must retain the project reference.
    await visitor.goto(`/projects/${project.id}`);
    await visitor.getByRole('button', { name: 'Book consultation', exact: true }).click();
    await visitor.getByRole('button', { name: 'Request consultation', exact: true }).click();
    await visitor.getByRole('link', { name: 'View my consultations' }).click();
    await expect(visitor.getByText(/Consultation Journey Kitchen/)).toBeVisible();
    await visitor.getByRole('button', { name: 'Cancel consultation', exact: true }).click();
    await visitor.getByLabel('Cancellation reason').fill('Our renovation schedule changed.');
    await visitor.getByRole('button', { name: 'Confirm cancellation' }).click();
    await expect(
      visitor.getByText(/Cancelled by the requester: Our renovation schedule changed/),
    ).toBeVisible();
    await visitor.reload();
    await expect(
      visitor.getByText(/Cancelled by the requester: Our renovation schedule changed/),
    ).toBeVisible();
    await visitor.screenshot({
      path: testInfo.outputPath('consultations-desktop.png'),
      fullPage: true,
    });
    await visitor.setViewportSize({ width: 390, height: 844 });
    await visitor.screenshot({
      path: testInfo.outputPath('consultations-mobile.png'),
      fullPage: true,
    });
    expect(
      await visitor.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(pageErrors).toEqual([]);
  } finally {
    await visitorContext.close();
    await designerContext.close();
    await db.delete(schema.organization).where(eq(schema.organization.id, org.id));
    await db.delete(schema.user).where(eq(schema.user.id, visitorUser.id));
    await db.delete(schema.user).where(eq(schema.user.id, owner.id));
  }
});
