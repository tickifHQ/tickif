import '../lib/environment';
import { randomInt, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { db, eq, inArray, schema } from '@repo/db';
import {
  assertTestDb,
  makeDesigner,
  makeOrganization,
  makeSubscription,
  makeUser,
} from '@repo/db/testing';
import { signInPhone } from '../lib/auth';
import { apiUrl, webUrl } from '../lib/environment';

const cases = [
  { role: 'owner', write: true, projects: true, leads: true, manage: true, billing: true },
  { role: 'admin', write: true, projects: true, leads: true, manage: true, billing: false },
  { role: 'member', write: true, projects: true, leads: true, manage: false, billing: false },
  {
    role: 'billing_admin',
    write: false,
    projects: false,
    leads: false,
    manage: false,
    billing: true,
  },
  { role: 'viewer', write: false, projects: true, leads: false, manage: false, billing: false },
] as const;

for (const policy of cases) {
  test(`Corporate ${policy.role} navigation and direct project creation enforce permissions`, async ({
    page,
    context,
  }, testInfo) => {
    test.setTimeout(120_000);
    await assertTestDb();
    const suffix = randomUUID();
    const userIds: string[] = [];
    const organization = await makeOrganization({ name: `Corporate ${policy.role} ${suffix}` });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      const owner = await makeUser({
        role: 'designer',
        status: 'active',
        phoneNumber: `+9196${randomInt(10_000_000, 100_000_000)}`,
        phoneNumberVerified: true,
      });
      userIds.push(owner.id);
      const profile = await makeDesigner({
        userId: owner.id,
        orgId: organization.id,
        status: 'active',
      });
      await db.insert(schema.member).values({
        id: randomUUID(),
        userId: owner.id,
        organizationId: organization.id,
        role: 'owner',
        createdAt: new Date(),
      });
      await makeSubscription({ organizationId: organization.id, planTier: 'corporate' });
      const actor =
        policy.role === 'owner'
          ? owner
          : await makeUser({
              role: 'designer',
              status: 'active',
              phoneNumber: `+9195${randomInt(10_000_000, 100_000_000)}`,
              phoneNumberVerified: true,
            });
      if (actor.id !== owner.id) {
        userIds.push(actor.id);
        await db.insert(schema.member).values({
          id: randomUUID(),
          userId: actor.id,
          organizationId: organization.id,
          role: policy.role,
          createdAt: new Date(),
        });
        await db.insert(schema.teamMember).values({
          id: randomUUID(),
          userId: actor.id,
          teamId: profile.teamId,
          createdAt: new Date(),
        });
      }
      await signInPhone(context, actor.phoneNumber);
      const selected = await context.request.put(`${apiUrl}/api/orgs/context`, {
        headers: { origin: webUrl },
        data: { kind: 'organization', organizationId: organization.id },
      });
      expect(selected.status()).toBe(200);
      await page.goto('/designer/dashboard');
      await expect(page.getByRole('button', { name: 'Switch context', exact: true })).toBeVisible();
      for (const [name, visible] of [
        ['Projects', policy.projects],
        ['Leads', policy.leads],
        ['Consultations', policy.leads],
        ['Reviews', policy.manage],
        ['Analytics', true],
        ['Portfolio', policy.manage],
        ['Verification', policy.manage],
        ['Team & Roles', policy.manage],
        ['Branches', policy.manage],
        ['Plan & billing', policy.billing],
        ['Add new project', policy.write],
      ] as const) {
        const link = page.getByRole('link', { name, exact: true });
        if (visible) await expect(link.first()).toBeVisible();
        else await expect(link).toHaveCount(0);
      }
      await page.screenshot({
        path: testInfo.outputPath(`${policy.role}-dashboard.png`),
        fullPage: true,
      });
      const create = await context.request.post(`${apiUrl}/api/projects`, {
        headers: { origin: webUrl },
        data: { title: `Permission probe ${suffix}` },
      });
      expect(create.status()).toBe(policy.write ? 201 : 403);
      await page.goto('/designer/projects/new');
      if (policy.write) await expect(page).toHaveURL(/\/designer\/projects\/upload$/);
      else await expect(page).toHaveURL(/\/unauthorized$/);
      for (const destination of ['profile', 'portfolio']) {
        await page.goto(`/designer/${destination}`);
        if (policy.manage) await expect(page).toHaveURL(new RegExp(`/designer/${destination}$`));
        else await expect(page).toHaveURL(/\/unauthorized$/);
      }
      expect(errors).toEqual([]);
    } finally {
      await assertTestDb();
      await db.delete(schema.organization).where(eq(schema.organization.id, organization.id));
      if (userIds.length) await db.delete(schema.user).where(inArray(schema.user.id, userIds));
    }
  });
}
