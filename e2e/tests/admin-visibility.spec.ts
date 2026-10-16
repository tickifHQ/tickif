import '../lib/environment';
import { randomInt, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { db, eq, inArray, schema } from '@repo/db';
import { assertTestDb, makeDesigner, makeLead, makeOrganization, makeUser } from '@repo/db/testing';
import { signInPhone } from '../lib/auth';
import { apiUrl, webUrl } from '../lib/environment';

test('admin lead visibility and company reporting retain filters through drill-down without changing enquiry milestones', async ({
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  await assertTestDb();
  const suffix = randomUUID();
  const users: string[] = [];
  const companies: string[] = [];
  const adminContext = await browser.newContext({
    baseURL: webUrl,
    viewport: { width: 1440, height: 1000 },
  });
  const visitorContext = await browser.newContext({ baseURL: webUrl });
  try {
    async function person(role: 'admin' | 'visitor' | 'designer') {
      const user = await makeUser({
        name: `Visibility ${role}`,
        email: `visibility-${role}-${suffix}@example.test`,
        phoneNumber: `+9193${randomInt(10_000_000, 100_000_000)}`,
        phoneNumberVerified: true,
        role,
        status: 'active',
      });
      users.push(user.id);
      return user;
    }
    const admin = await person('admin');
    const visitor = await person('visitor');
    const owner = await person('designer');
    const company = await makeOrganization({ name: `Visibility Alpha ${suffix}` });
    const other = await makeOrganization({ name: `Visibility Beta ${suffix}` });
    companies.push(company.id, other.id);
    const designer = await makeDesigner({
      userId: owner.id,
      orgId: company.id,
      displayName: 'Visibility designer',
    });
    const otherDesigner = await makeDesigner({
      userId: owner.id,
      orgId: other.id,
      displayName: 'Other designer',
    });
    const receivedAt = new Date('2026-10-11T10:00:00Z');
    const lead = await makeLead({
      organizationId: company.id,
      teamId: designer.teamId,
      name: 'Visibility private lead',
      contactNumber: '+919811112233',
      source: 'enquiry',
      status: 'contacted',
      message: 'Private original message',
      notes: 'Private admin follow-up note',
      receivedAt,
    });
    const otherLead = await makeLead({
      organizationId: other.id,
      teamId: otherDesigner.teamId,
      name: 'Other company lead',
      receivedAt,
    });
    const [enquiry] = await db
      .insert(schema.enquiry)
      .values({
        requesterId: visitor.id,
        designerProfileId: designer.id,
        organizationId: company.id,
        leadId: lead.id,
        subject: 'Visibility enquiry',
        description: 'Detailed homeowner request',
        budget: '10-15 lakh',
        status: 'responded',
        contactedAt: new Date('2026-10-15T10:00:00Z'),
        createdAt: receivedAt,
      })
      .returning();
    await db.insert(schema.enquiryMessage).values([
      {
        enquiryId: enquiry!.id,
        authorId: owner.id,
        requestId: randomUUID(),
        body: 'First private studio reply',
        createdAt: new Date('2026-10-15T10:00:00Z'),
      },
      {
        enquiryId: enquiry!.id,
        authorId: owner.id,
        requestId: randomUUID(),
        body: 'Second private studio reply',
        createdAt: new Date('2026-10-16T10:00:00Z'),
      },
    ]);
    await signInPhone(adminContext, admin.phoneNumber!);
    await signInPhone(visitorContext, visitor.phoneNumber!);
    const page = await adminContext.newPage();
    const runtimeErrors: string[] = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    await page.goto('/admin/leads?from=2026-10-11&to=2026-10-11');
    await expect(page.getByRole('heading', { name: 'Leads and pipeline' })).toBeVisible();
    await page.locator('summary').filter({ hasText: 'All companies' }).click();
    await page.getByRole('textbox', { name: 'Search companies' }).fill(company.name);
    await page.getByRole('button', { name: company.name, exact: true }).click();
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page).toHaveURL(new RegExp(`organizationId=${company.id}`));
    await expect(page.getByRole('link', { name: 'Visibility private lead' })).toBeVisible();
    await expect(page.getByText(otherLead.name)).toHaveCount(0);
    await page
      .getByRole('region', { name: 'Lead pipeline' })
      .getByRole('link', { name: /contacted/i })
      .click();
    await expect(page).toHaveURL(/status=contacted/);
    await expect(page.getByRole('combobox', { name: 'Lead stage' })).toHaveValue('contacted');
    await page.screenshot({ path: testInfo.outputPath('admin-leads-desktop.png'), fullPage: true });
    await page.getByRole('link', { name: 'Visibility private lead' }).click();
    await expect(page.getByText('Private admin follow-up note')).toBeVisible();
    await expect(page.getByText('Detailed homeowner request')).toBeVisible();
    await expect(page.getByText('First private studio reply')).toBeVisible();
    await expect(page.getByText('Second private studio reply')).toBeVisible();
    await expect(page.getByRole('button', { name: /send|book|confirm|assign|save/i })).toHaveCount(
      0,
    );
    const [unchanged] = await db
      .select()
      .from(schema.enquiry)
      .where(eq(schema.enquiry.id, enquiry!.id));
    expect(unchanged?.viewedAt).toBeNull();
    expect(unchanged?.activityReadAt).toBeNull();
    await page.getByRole('link', { name: 'Back to filtered leads', exact: false }).click();
    await expect(page).toHaveURL(/status=contacted/);
    await page.goto(`/admin/analytics?from=2026-10-11&to=2026-10-11&organizationId=${company.id}`);
    const summary = page.getByRole('region', { name: 'Performance summary' });
    await expect(summary.getByText('Pipeline conversion rate')).toBeVisible();
    await expect(
      summary.locator('[data-slot=card]').filter({ hasText: 'Response rate' }).getByText('100.0%'),
    ).toBeVisible();
    await page.getByRole('link', { name: company.name, exact: true }).click();
    await expect(page).toHaveURL(/groupBy=designer/);
    await expect(page.getByRole('combobox', { name: 'Compare' })).toHaveValue('designer');
    await page.getByRole('link', { name: 'Visibility designer', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`designerId=${designer.id}`));
    await page.getByText('Show daily response and conversion report').click();
    await expect(page.getByRole('cell', { name: '2026-10-11', exact: true })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('admin-company-analytics-desktop.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const main = page.getByRole('main');
    expect(await main.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath('admin-company-analytics-mobile.png'),
      fullPage: true,
    });
    await page.getByRole('link', { name: /View matching leads/ }).click();
    await expect(page).toHaveURL(new RegExp(`designerId=${designer.id}`));
    await expect(page.getByRole('link', { name: 'Visibility private lead' })).toBeVisible();
    const visitorPage = await visitorContext.newPage();
    await visitorPage.goto('/admin/leads');
    await expect(visitorPage).toHaveURL(`${webUrl}/unauthorized`);
    expect((await visitorContext.request.get(`${apiUrl}/api/admin/insights/report`)).status()).toBe(
      403,
    );
    expect(runtimeErrors).toEqual([]);
  } finally {
    await Promise.allSettled([adminContext.close(), visitorContext.close()]);
    await assertTestDb();
    if (companies.length)
      await db.delete(schema.organization).where(inArray(schema.organization.id, companies));
    if (users.length) await db.delete(schema.user).where(inArray(schema.user.id, users));
  }
});
