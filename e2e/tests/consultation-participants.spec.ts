import '../lib/environment';
import { randomInt, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { db, eq, schema } from '@repo/db';
import { assertTestDb, makeDesigner, makeOrganization, makeUser } from '@repo/db/testing';
import { signInPhone as signIn } from '../lib/auth';
import { apiUrl, webUrl } from '../lib/environment';
import { makePublicPortfolio } from '../lib/public-portfolio';

test('disabled consultations route public requests through enquiries and hide legacy surfaces', async ({
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(120_000);
  await assertTestDb();
  const suffix = randomUUID();
  const visitorUser = await makeUser({
    name: 'Enquiry Journey Visitor',
    email: `enquiry-visitor-${suffix}@test.local`,
    phoneNumber: `+9195${randomInt(10_000_000, 99_999_999)}`,
    phoneNumberVerified: true,
    status: 'active',
  });
  const owner = await makeUser({
    name: 'Enquiry Journey Owner',
    email: `enquiry-owner-${suffix}@test.local`,
    phoneNumber: `+9196${randomInt(10_000_000, 99_999_999)}`,
    phoneNumberVerified: true,
    role: 'designer',
    status: 'active',
  });
  const org = await makeOrganization({
    name: 'Enquiry Journey Studio',
    slug: `enquiry-journey-${suffix}`,
  });
  const profile = await makeDesigner({
    userId: owner.id,
    orgId: org.id,
    slug: org.slug,
    displayName: org.name,
    status: 'active',
    phone: owner.phoneNumber,
    bio: 'Enquiry journey studio biography.',
    logoImageId: 'e2e/public/enquiry-journey-logo.png',
  });
  await makePublicPortfolio({ profileId: profile.id, portfolioSlug: profile.slug });
  await db.insert(schema.member).values({
    id: randomUUID(),
    organizationId: org.id,
    userId: owner.id,
    role: 'owner',
    createdAt: new Date(),
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
          headers: { origin: webUrl },
          data: { organizationId: org.id },
        })
      ).ok(),
    ).toBeTruthy();
    expect(
      (
        await designerContext.request.post(`${apiUrl}/api/auth/organization/set-active-team`, {
          headers: { origin: webUrl },
          data: { teamId: profile.teamId },
        })
      ).ok(),
    ).toBeTruthy();

    await visitor.goto(`/d/${profile.slug}`);
    await expect(visitor.getByRole('button', { name: 'Book consultation' })).toHaveCount(0);
    await visitor.getByRole('button', { name: 'Send enquiry', exact: true }).first().click();
    const enquiryDialog = visitor.getByRole('dialog', { name: 'Send an Enquiry' });
    await enquiryDialog
      .getByLabel('Description', { exact: false })
      .fill('Please help us plan a kitchen renovation.');
    await enquiryDialog.getByRole('button', { name: 'Send Enquiry', exact: true }).click();
    await expect(enquiryDialog.getByText('Enquiry sent successfully!')).toBeVisible();

    const leads = await db
      .select({ name: schema.lead.name, source: schema.lead.source })
      .from(schema.lead)
      .where(eq(schema.lead.organizationId, org.id));
    expect(leads).toEqual([{ name: visitorUser.name, source: 'enquiry' }]);

    const futureDate = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    const disabledBooking = await visitorContext.request.post(`${apiUrl}/api/bookings`, {
      headers: { origin: webUrl },
      data: {
        designerProfileId: profile.id,
        preferredSlots: [{ date: futureDate, window: 'morning' }],
      },
    });
    expect(disabledBooking.status()).toBe(404);
    expect(
      await db
        .select({ id: schema.consultationBooking.id })
        .from(schema.consultationBooking)
        .where(eq(schema.consultationBooking.requesterId, visitorUser.id)),
    ).toEqual([]);

    await visitor.goto('/home/consultations');
    await expect(visitor).toHaveURL(/\/enquiries$/);

    await designer.goto('/designer/leads');
    await expect(designer.getByRole('link', { name: 'Consultations', exact: true })).toHaveCount(0);
    await expect(designer.getByRole('columnheader', { name: 'Type', exact: true })).toHaveCount(0);
    await expect(designer.getByText(visitorUser.name, { exact: true })).toBeVisible();
    await designer.goto('/designer/consultations');
    await expect(designer).toHaveURL(/\/designer\/leads$/);

    await designer.screenshot({
      path: testInfo.outputPath('enquiry-only-leads.png'),
      fullPage: true,
    });
    expect(pageErrors).toEqual([]);
  } finally {
    await Promise.allSettled([visitorContext.close(), designerContext.close()]);
    await assertTestDb();
    await db.delete(schema.organization).where(eq(schema.organization.id, org.id));
    await db.delete(schema.user).where(eq(schema.user.id, visitorUser.id));
    await db.delete(schema.user).where(eq(schema.user.id, owner.id));
  }
});
