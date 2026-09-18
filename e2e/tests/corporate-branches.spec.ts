import '../lib/environment';
import { randomInt, randomUUID } from 'node:crypto';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { and, db, eq, inArray, schema } from '@repo/db';
import {
  assertTestDb,
  makeDesigner,
  makeLead,
  makeOrganization,
  makeProject,
  makeSubscription,
  makeTeam,
  makeUser,
} from '@repo/db/testing';
import { signInPhone } from '../lib/auth';
import { apiUrl, webUrl } from '../lib/environment';

const headers = { origin: webUrl };

async function selectBranch(context: BrowserContext, organizationId: string, teamId: string) {
  const response = await context.request.put(`${apiUrl}/api/orgs/context`, {
    headers,
    data: { kind: 'organization', organizationId, teamId },
  });
  expect(response.status()).toBe(200);
}

function section(page: Page, name: string) {
  return page.getByRole('heading', { name, exact: true }).locator('..');
}

test('Corporate branch management enforces roles and preserves operational data', async ({
  browser,
  page,
  context,
}) => {
  test.setTimeout(300_000);
  await assertTestDb();
  const suffix = randomUUID();
  const label = suffix.slice(0, 8);
  const userIds: string[] = [];
  const organizationIds: string[] = [];
  const adminContext = await browser.newContext({ baseURL: webUrl });
  const memberContext = await browser.newContext({ baseURL: webUrl });
  const viewerContext = await browser.newContext({ baseURL: webUrl });

  try {
    async function person(role: 'Owner' | 'Admin' | 'Member' | 'Viewer') {
      const user = await makeUser({
        name: `Branch ${role} ${label}`,
        email: `branch-${role.toLowerCase()}-${suffix}@example.test`,
        phoneNumber: `+9193${randomInt(10_000_000, 100_000_000)}`,
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
    const viewer = await person('Viewer');
    const organization = await makeOrganization({ name: `Branch Studio ${label}` });
    organizationIds.push(organization.id);
    await makeSubscription({ organizationId: organization.id, planTier: 'corporate' });

    const primaryTeam = await makeTeam({
      organizationId: organization.id,
      name: `Primary ${label}`,
    });
    const removableTeam = await makeTeam({
      organizationId: organization.id,
      name: `Removable ${label}`,
    });
    const primaryProfile = await makeDesigner({
      userId: owner.id,
      orgId: organization.id,
      teamId: primaryTeam.id,
      displayName: `Primary Studio ${label}`,
      status: 'active',
    });
    const removableProfile = await makeDesigner({
      userId: owner.id,
      orgId: organization.id,
      teamId: removableTeam.id,
      displayName: `Removable Studio ${label}`,
      status: 'active',
    });
    await db.insert(schema.member).values([
      {
        id: randomUUID(),
        organizationId: organization.id,
        userId: owner.id,
        role: 'owner',
        createdAt: new Date(),
      },
      {
        id: randomUUID(),
        organizationId: organization.id,
        userId: admin.id,
        role: 'admin',
        createdAt: new Date(),
      },
      {
        id: randomUUID(),
        organizationId: organization.id,
        userId: member.id,
        role: 'member',
        createdAt: new Date(),
      },
      {
        id: randomUUID(),
        organizationId: organization.id,
        userId: viewer.id,
        role: 'viewer',
        createdAt: new Date(),
      },
    ]);
    await db.insert(schema.teamMember).values(
      [primaryTeam, removableTeam].map((team) => ({
        id: randomUUID(),
        teamId: team.id,
        userId: admin.id,
        createdAt: new Date(),
      })),
    );
    await db.insert(schema.teamMember).values([
      {
        id: randomUUID(),
        teamId: primaryTeam.id,
        userId: member.id,
        createdAt: new Date(),
      },
      {
        id: randomUUID(),
        teamId: primaryTeam.id,
        userId: viewer.id,
        createdAt: new Date(),
      },
    ]);

    const primaryProject = await makeProject({
      designerId: primaryProfile.id,
      title: `Primary Project ${label}`,
      status: 'draft',
    });
    const removableProject = await makeProject({
      designerId: removableProfile.id,
      title: `Removable Project ${label}`,
      status: 'draft',
    });
    const removableLead = await makeLead({
      organizationId: organization.id,
      teamId: removableTeam.id,
      referredProjectId: removableProject.id,
      name: `Removable Lead ${label}`,
    });

    await signInPhone(context, owner.phoneNumber!);
    await signInPhone(adminContext, admin.phoneNumber!);
    await signInPhone(memberContext, member.phoneNumber!);
    await signInPhone(viewerContext, viewer.phoneNumber!);
    for (const current of [context, adminContext, memberContext, viewerContext]) {
      await selectBranch(current, organization.id, primaryTeam.id);
    }

    await page.goto('/designer/branches');
    await page.getByLabel('Branch name').fill(`Owner Created ${label}`);
    await page.getByRole('button', { name: 'Create branch', exact: true }).click();
    await expect(page.getByRole('status')).toContainText(`Branch Owner Created ${label} created.`);

    const adminPage = await adminContext.newPage();
    await adminPage.goto('/designer/branches');
    await adminPage.getByLabel('Branch name').fill(`Admin Created ${label}`);
    await adminPage.getByRole('button', { name: 'Create branch', exact: true }).click();
    await expect(adminPage.getByRole('status')).toContainText(
      `Branch Admin Created ${label} created.`,
    );

    const adminAssignment = section(adminPage, 'Assign a member to a branch');
    await adminAssignment.getByLabel('Member').selectOption(member.id);
    await adminAssignment.getByLabel('Branch').selectOption(removableTeam.id);
    await adminAssignment.getByRole('button', { name: 'Assign', exact: true }).click();
    await expect(adminPage.getByRole('status')).toContainText(
      `${member.name} assigned to the branch.`,
    );
    await adminPage.getByRole('button', { name: `Show members of ${removableTeam.name}` }).click();
    await expect(adminPage.getByText(member.email, { exact: true })).toBeVisible();
    await adminPage
      .getByRole('button', { name: `Remove ${member.name} from ${removableTeam.name}` })
      .click();
    await adminPage
      .getByRole('button', {
        name: `Confirm removal of ${member.name} from ${removableTeam.name}`,
      })
      .click();
    await expect(adminPage.getByRole('status')).toContainText(
      `${member.name} removed from the branch.`,
    );
    await expect
      .poll(async () => {
        const rows = await db
          .select({ id: schema.teamMember.id })
          .from(schema.teamMember)
          .where(
            and(
              eq(schema.teamMember.teamId, removableTeam.id),
              eq(schema.teamMember.userId, member.id),
            ),
          );
        return rows.length;
      })
      .toBe(0);

    const removableCard = adminPage
      .getByText(removableTeam.name, { exact: true })
      .locator('..')
      .locator('..');
    await removableCard.getByRole('button', { name: 'Switch Branch', exact: true }).click();
    await expect(adminPage).toHaveURL(/\/designer\/dashboard$/);
    await adminPage.goto('/designer/projects');
    await expect(
      adminPage.getByText(removableProject.title, { exact: true }).first(),
    ).toBeVisible();
    await expect(adminPage.getByText(primaryProject.title, { exact: true })).toHaveCount(0);

    for (const [limitedContext, role] of [
      [memberContext, 'member'],
      [viewerContext, 'viewer'],
    ] as const) {
      const limitedPage = await limitedContext.newPage();
      await limitedPage.goto('/designer/branches');
      await expect(
        limitedPage.getByText('Branch management is available to studio owners and admins.'),
      ).toBeVisible();
      await expect(limitedPage.getByRole('button', { name: 'Create branch' })).toHaveCount(0);
      await expect(limitedPage.getByRole('button', { name: 'Assign' })).toHaveCount(0);
      await expect(limitedPage.getByRole('button', { name: /Remove .* from/ })).toHaveCount(0);
      const forbidden = await limitedContext.request.post(
        `${apiUrl}/api/auth/organization/create-team`,
        {
          headers,
          data: { organizationId: organization.id, name: `Forbidden ${role} ${label}` },
        },
      );
      expect(forbidden.status()).toBe(403);
      await limitedPage.close();
    }

    await page.reload();
    await page.getByRole('button', { name: `Remove branch ${removableTeam.name}` }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Move projects to').selectOption(primaryTeam.id);
    await dialog.getByRole('button', { name: 'Confirm removal', exact: true }).click();
    await expect(page.getByRole('status')).toContainText(
      `Branch ${removableTeam.name} removed. 1 project moved.`,
    );
    await expect(page.getByText(removableTeam.name, { exact: true })).toHaveCount(0);

    await expect
      .poll(async () => {
        const [project] = await db
          .select({ designerId: schema.project.designerId })
          .from(schema.project)
          .where(eq(schema.project.id, removableProject.id));
        const [lead] = await db
          .select({ teamId: schema.lead.teamId })
          .from(schema.lead)
          .where(eq(schema.lead.id, removableLead.id));
        const [removed] = await db
          .select({ id: schema.team.id })
          .from(schema.team)
          .where(eq(schema.team.id, removableTeam.id));
        return {
          projectDesignerId: project?.designerId,
          leadTeamId: lead?.teamId,
          branchExists: Boolean(removed),
        };
      })
      .toEqual({
        projectDesignerId: primaryProfile.id,
        leadTeamId: primaryTeam.id,
        branchExists: false,
      });
    await page.goto('/designer/projects');
    await expect(page.getByText(primaryProject.title, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(removableProject.title, { exact: true }).first()).toBeVisible();
  } finally {
    await Promise.all([adminContext.close(), memberContext.close(), viewerContext.close()]);
    await assertTestDb();
    if (organizationIds.length) {
      await db.delete(schema.organization).where(inArray(schema.organization.id, organizationIds));
    }
    if (userIds.length) await db.delete(schema.user).where(inArray(schema.user.id, userIds));
  }
});
