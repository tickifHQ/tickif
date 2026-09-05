import '../lib/environment';
import { randomInt, randomUUID } from 'node:crypto';
import { expect, test, type BrowserContext } from '@playwright/test';
import type { ZodType } from 'zod';
import {
  analyticsResponseSchema,
  billingPaymentsResponseSchema,
  currentProfileResponseSchema,
  listLeadsResponseSchema,
  listProjectsResponseSchema,
  portfolioResponseSchema,
  verificationStateResponseSchema,
} from '@repo/contracts';
import { db, inArray, schema } from '@repo/db';
import {
  assertTestDb,
  makeDesigner,
  makeLead,
  makeOrganization,
  makeProject,
  makeSubscription,
  makeUser,
} from '@repo/db/testing';
import { signInPhone } from '../lib/auth';
import { apiUrl, webUrl } from '../lib/environment';

const headers = { origin: webUrl };
async function read<T>(context: BrowserContext, path: string, contract: ZodType<T>): Promise<T> {
  const response = await context.request.get(`${apiUrl}${path}`);
  expect(response.status(), path).toBe(200);
  return contract.parse(await response.json());
}
async function selectOrganization(context: BrowserContext, organizationId: string) {
  const response = await context.request.put(`${apiUrl}/api/orgs/context`, {
    headers,
    data: { kind: 'organization', organizationId },
  });
  expect(response.status()).toBe(200);
}

test('studio workspaces isolate all business surfaces and enforce owner, admin and member capabilities', async ({
  page,
  context,
  browser,
}, testInfo) => {
  test.setTimeout(300_000);
  await assertTestDb();
  const userIds: string[] = [];
  const organizationIds: string[] = [];
  const adminContext = await browser.newContext({ baseURL: webUrl });
  const memberContext = await browser.newContext({ baseURL: webUrl });
  const suffix = randomUUID();
  const label = suffix.slice(0, 8);
  try {
    async function person(name: string) {
      const user = await makeUser({
        id: `workflow-${name}-${suffix}`,
        name: `Workflow ${name}`,
        email: `workflow-${name}-${suffix}@example.test`,
        phoneNumber: `+9194${randomInt(10_000_000, 100_000_000)}`,
        phoneNumberVerified: true,
        role: 'designer',
        status: 'active',
      });
      userIds.push(user.id);
      return user;
    }
    const owner = await person('Owner');
    const admin = await person('Admin');
    const member = await person('Member');
    async function studio(name: string, publishedCount: number, amount: number) {
      const organization = await makeOrganization({
        id: `workflow-${name}-${suffix}`,
        name: `${name} ${label}`,
      });
      organizationIds.push(organization.id);
      const profile = await makeDesigner({
        userId: owner.id,
        orgId: organization.id,
        displayName: organization.name,
        status: 'active',
        bio: `${name} private studio biography`,
      });
      await db.insert(schema.member).values({
        id: randomUUID(),
        organizationId: organization.id,
        userId: owner.id,
        role: 'owner',
        createdAt: new Date(),
      });
      const portfolioSlug = `${name.toLowerCase()}-${suffix}`;
      await db
        .insert(schema.designerPortfolio)
        .values({ profileId: profile.id, portfolioSlug, tagline: `${name} design approach` });
      const subscription = await makeSubscription({
        organizationId: organization.id,
        planTier: 'corporate',
      });
      await db.insert(schema.paymentTransaction).values({
        subscriptionId: subscription.id,
        razorpayPaymentId: `pay_${name}_${suffix}`,
        amount,
        currency: 'INR',
        status: 'captured',
        payload: {},
      });
      const published = [];
      for (let index = 0; index < publishedCount; index++)
        published.push(
          await makeProject({
            designerId: profile.id,
            title: `${name} Published ${index + 1} ${label}`,
            status: 'published',
          }),
        );
      const draft = await makeProject({
        designerId: profile.id,
        title: `${name} Draft ${label}`,
        status: 'draft',
      });
      const lead = await makeLead({
        organizationId: organization.id,
        teamId: profile.teamId,
        referredProjectId: draft.id,
        name: `${name} Private Lead ${label}`,
        contactNumber: '+919800001234',
      });
      return {
        organization,
        profile,
        portfolioSlug,
        draft,
        published,
        lead,
        amount,
        projectCount: publishedCount + 1,
      };
    }
    const first = await studio('Amber', 1, 111100);
    const second = await studio('Birch', 2, 222200);
    const memberId = randomUUID();
    await db.insert(schema.member).values([
      {
        id: randomUUID(),
        organizationId: first.organization.id,
        userId: admin.id,
        role: 'admin',
        createdAt: new Date(),
      },
      {
        id: memberId,
        organizationId: first.organization.id,
        userId: member.id,
        role: 'member',
        createdAt: new Date(),
      },
    ]);
    await db.insert(schema.teamMember).values(
      [admin, member].map((user) => ({
        id: randomUUID(),
        teamId: first.profile.teamId,
        userId: user.id,
        createdAt: new Date(),
      })),
    );
    // Members see their assigned lead/project; unassigned studio records remain private.
    const assignedProject = await makeProject({
      designerId: first.profile.id,
      responsibleMemberId: memberId,
      title: `Member Draft ${label}`,
      status: 'draft',
    });
    first.projectCount++;
    const assignedLead = await makeLead({
      organizationId: first.organization.id,
      teamId: first.profile.teamId,
      referredProjectId: assignedProject.id,
      assignedMemberId: memberId,
      name: `Member Assigned Lead ${label}`,
      contactNumber: '+919800005678',
    });
    await signInPhone(context, owner.phoneNumber);
    await signInPhone(adminContext, admin.phoneNumber);
    await signInPhone(memberContext, member.phoneNumber);
    await selectOrganization(context, first.organization.id);
    await selectOrganization(adminContext, first.organization.id);
    await selectOrganization(memberContext, first.organization.id);

    const verificationIds = new Set<string>();
    for (const [index, current] of [first, second].entries()) {
      const other = index === 0 ? second : first;
      if (index === 1) {
        // Exercise the actual workspace switcher, then verify every screen against the new session.
        await page.getByRole('button', { name: 'Switch context', exact: true }).click();
        await page.getByRole('menuitem', { name: current.organization.name, exact: true }).click();
        await expect(
          page.getByRole('button', { name: 'Switch context', exact: true }),
        ).toContainText(current.organization.name);
      }
      const projects = await read(context, '/api/projects', listProjectsResponseSchema);
      expect(projects.items.map((project) => project.id)).toContain(current.draft.id);
      expect(projects.items.map((project) => project.id)).not.toContain(other.draft.id);
      await page.goto('/designer/projects');
      await expect(page.getByText(current.draft.title, { exact: true }).first()).toBeVisible();
      await expect(page.getByText(other.draft.title, { exact: true })).toHaveCount(0);

      const leads = await read(context, '/api/leads', listLeadsResponseSchema);
      expect(leads.items.map((lead) => lead.id)).toContain(current.lead.id);
      expect(leads.items.map((lead) => lead.id)).not.toContain(other.lead.id);
      expect((await context.request.get(`${apiUrl}/api/leads/${other.lead.id}`)).status()).toBe(
        404,
      );
      await page.goto('/designer/leads');
      await expect(page.getByText(current.lead.name, { exact: true }).first()).toBeVisible();
      await expect(page.getByText(other.lead.name, { exact: true })).toHaveCount(0);

      const profile = await read(context, '/api/profiles/me', currentProfileResponseSchema);
      expect(profile.id).toBe(current.profile.id);
      expect(profile.organization.id).toBe(current.organization.id);
      await page.goto('/designer/profile');
      await expect(page.getByLabel('Display name', { exact: true })).toHaveValue(
        current.profile.displayName,
      );
      await expect(page.getByLabel('Bio', { exact: true })).toHaveValue(current.profile.bio!);

      const portfolio = await read(context, '/api/profiles/me/portfolio', portfolioResponseSchema);
      expect(portfolio.portfolioSlug).toBe(current.portfolioSlug);
      expect(portfolio.displayName).toBe(current.profile.displayName);
      await page.goto('/designer/portfolio');
      await expect(page.getByPlaceholder('your-studio', { exact: true })).toHaveValue(
        current.portfolioSlug,
      );

      const verification = await read(
        context,
        '/api/verifications',
        verificationStateResponseSchema,
      );
      expect(verificationIds.has(verification.applicationId)).toBe(false);
      verificationIds.add(verification.applicationId);
      expect(verification.eligibility.publishedProjects.current).toBe(current.published.length);
      expect(verification.permissions.canManage).toBe(true);
      await page.goto('/designer/verification');
      await expect(page.getByRole('heading', { name: 'Get Verified', exact: true })).toBeVisible();
      await expect(
        page.getByLabel(
          `${current.published.length} of ${verification.eligibility.publishedProjects.required} projects published`,
          { exact: true },
        ),
      ).toBeVisible();

      const analytics = await read(
        context,
        '/api/reports/analytics?days=30',
        analyticsResponseSchema,
      );
      expect(analytics.access.role).toBe('owner');
      expect(analytics.projects.total).toBe(current.projectCount);
      expect(analytics.projects.published).toBe(current.published.length);
      await page.goto('/designer/analytics');
      await expect(page.getByRole('heading', { name: 'Analytics', exact: true })).toBeVisible();
      await expect(page.getByText('Could not load analytics', { exact: true })).toHaveCount(0);

      const payments = await read(context, '/api/billing/payments', billingPaymentsResponseSchema);
      expect(payments.items.map((payment) => payment.amount)).toEqual([current.amount]);
      await page.goto('/designer/plan-billing');
      await expect(page.getByText('Billing access restricted', { exact: true })).toHaveCount(0);
      await expect(page.getByText('Payment history', { exact: true })).toBeVisible();
      const payment = payments.items[0];
      if (!payment) throw new Error('The scoped payment fixture is missing');
      await expect(page.getByRole('cell', { name: payment.id, exact: true })).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath(`organization-${index + 1}-billing.png`),
        fullPage: true,
      });
    }

    // An admin can manage organization content and KYC, but cannot see owner billing.
    const adminProfile = await adminContext.request.patch(`${apiUrl}/api/profiles/me`, {
      headers,
      data: { bio: 'Admin edited only Amber studio' },
    });
    expect(adminProfile.status()).toBe(200);
    expect(
      (
        await adminContext.request.patch(`${apiUrl}/api/profiles/me/portfolio`, {
          headers,
          data: { tagline: 'Admin updated Amber portfolio' },
        })
      ).status(),
    ).toBe(200);
    expect(
      (await read(adminContext, '/api/verifications', verificationStateResponseSchema)).permissions
        .canManage,
    ).toBe(true);
    expect(
      (await read(adminContext, '/api/reports/analytics', analyticsResponseSchema)).access
        .roleScope,
    ).toBe('full');
    expect(
      (await read(adminContext, '/api/leads', listLeadsResponseSchema)).items.map(
        (lead) => lead.id,
      ),
    ).toContain(first.lead.id);
    expect((await adminContext.request.get(`${apiUrl}/api/billing/payments`)).status()).toBe(403);
    const adminPage = await adminContext.newPage();
    await adminPage.goto('/designer/plan-billing');
    await expect(
      adminPage.getByRole('heading', { name: 'Billing access restricted', exact: true }),
    ).toBeVisible();

    // Members may edit their project and view assigned leads; management and money stay restricted.
    expect(
      (
        await memberContext.request.patch(`${apiUrl}/api/projects/${assignedProject.id}`, {
          headers,
          data: { title: `Member edited draft ${label}` },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await memberContext.request.delete(`${apiUrl}/api/projects/${assignedProject.id}`, {
          headers,
        })
      ).status(),
    ).toBe(403);
    const memberLeads = await read(memberContext, '/api/leads', listLeadsResponseSchema);
    expect(memberLeads.items.map((lead) => lead.id)).toEqual([assignedLead.id]);
    expect((await memberContext.request.get(`${apiUrl}/api/leads/${first.lead.id}`)).status()).toBe(
      404,
    );
    expect(
      (
        await memberContext.request.patch(`${apiUrl}/api/profiles/me`, {
          headers,
          data: { bio: 'Forbidden member update' },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await memberContext.request.patch(`${apiUrl}/api/profiles/me/portfolio`, {
          headers,
          data: { tagline: 'Forbidden member update' },
        })
      ).status(),
    ).toBe(403);
    expect(
      (await read(memberContext, '/api/verifications', verificationStateResponseSchema)).permissions
        .canManage,
    ).toBe(false);
    expect(
      (
        await memberContext.request.post(`${apiUrl}/api/verifications/submit`, { headers })
      ).status(),
    ).toBe(403);
    expect(
      (await read(memberContext, '/api/reports/analytics', analyticsResponseSchema)).access
        .roleScope,
    ).toBe('own');
    expect((await memberContext.request.get(`${apiUrl}/api/billing/payments`)).status()).toBe(403);
    const memberPage = await memberContext.newPage();
    await memberPage.goto('/designer/leads');
    await expect(memberPage.getByText(assignedLead.name, { exact: true }).first()).toBeVisible();
    await expect(memberPage.getByText(first.lead.name, { exact: true })).toHaveCount(0);
    await memberPage.goto('/designer/plan-billing');
    await expect(
      memberPage.getByRole('heading', { name: 'Billing access restricted', exact: true }),
    ).toBeVisible();
    for (const limited of [adminContext, memberContext]) {
      expect(
        (
          await limited.request.put(`${apiUrl}/api/orgs/context`, {
            headers,
            data: { kind: 'organization', organizationId: second.organization.id },
          })
        ).status(),
      ).toBe(403);
      expect(
        (
          await limited.request.patch(`${apiUrl}/api/projects/${second.draft.id}`, {
            headers,
            data: { title: 'Cross-studio edit' },
          })
        ).status(),
      ).toBe(403);
    }
    // Owner is still in Birch: Amber admin writes must not alter Birch's private profile/portfolio.
    expect((await read(context, '/api/profiles/me', currentProfileResponseSchema)).bio).toBe(
      second.profile.bio,
    );
    expect(
      (await read(context, '/api/profiles/me/portfolio', portfolioResponseSchema)).tagline,
    ).toBe('Birch design approach');
    await selectOrganization(context, first.organization.id);
    expect((await read(context, '/api/profiles/me', currentProfileResponseSchema)).bio).toBe(
      'Admin edited only Amber studio',
    );
    expect(
      (await read(context, '/api/profiles/me/portfolio', portfolioResponseSchema)).tagline,
    ).toBe('Admin updated Amber portfolio');
  } finally {
    await adminContext.close();
    await memberContext.close();
    await assertTestDb();
    if (organizationIds.length)
      await db.delete(schema.organization).where(inArray(schema.organization.id, organizationIds));
    if (userIds.length) await db.delete(schema.user).where(inArray(schema.user.id, userIds));
  }
});
