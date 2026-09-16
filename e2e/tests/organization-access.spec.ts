import '../lib/environment';
import { randomInt, randomUUID } from 'node:crypto';
import { expect, test, type BrowserContext } from '@playwright/test';
import { activeContextResponseSchema, organizationWorkspaceResponseSchema } from '@repo/contracts';
import { db, inArray, schema } from '@repo/db';
import { assertTestDb, makeDesigner, makeOrganization, makeUser } from '@repo/db/testing';
import { signInPhone } from '../lib/auth';
import { apiUrl, webUrl } from '../lib/environment';

const headers = { origin: webUrl };

test('the studio picker refreshes memberships added after its list was cached', async ({
  page,
  context,
}) => {
  await assertTestDb();
  const suffix = randomUUID();
  const owner = await makeUser({
    name: 'Picker Refresh Owner',
    email: `picker-refresh-${suffix}@example.test`,
    phoneNumber: `+9193${randomInt(10_000_000, 100_000_000)}`,
    phoneNumberVerified: true,
    role: 'designer',
    status: 'active',
  });
  const organizationIds: string[] = [];
  try {
    const first = await makeOrganization({ name: `Original Studio ${suffix}` });
    organizationIds.push(first.id);
    await makeDesigner({ userId: owner.id, orgId: first.id });
    await db.insert(schema.member).values({
      id: randomUUID(),
      userId: owner.id,
      organizationId: first.id,
      role: 'owner',
      createdAt: new Date(),
    });
    await signInPhone(context, owner.phoneNumber);
    await selectOrganization(context, first.id);
    await page.goto('/designer/dashboard');
    const picker = page.getByRole('button', { name: 'Switch context', exact: true });
    await picker.click();
    await expect(page.getByRole('menuitem', { name: new RegExp(first.name) })).toBeVisible();
    await page.keyboard.press('Escape');

    // Match a membership committed by the custom creation endpoint, which does
    // not run Better Auth's browser-side cache invalidation listeners.
    const second = await makeOrganization({ name: `New Studio ${suffix}` });
    organizationIds.push(second.id);
    await makeDesigner({ userId: owner.id, orgId: second.id });
    await db.insert(schema.member).values({
      id: randomUUID(),
      userId: owner.id,
      organizationId: second.id,
      role: 'owner',
      createdAt: new Date(),
    });
    await picker.click();
    await page.getByRole('menuitem', { name: second.name, exact: true }).click();
    await expect(picker).toContainText(second.name);
    expect((await workspace(context)).organization.id).toBe(second.id);
  } finally {
    await assertTestDb();
    if (organizationIds.length) {
      await db.delete(schema.organization).where(inArray(schema.organization.id, organizationIds));
    }
    await db.delete(schema.user).where(inArray(schema.user.id, [owner.id]));
  }
});

async function workspace(context: BrowserContext) {
  const response = await context.request.get(`${apiUrl}/api/orgs/current`);
  expect(response.ok()).toBeTruthy();
  return organizationWorkspaceResponseSchema.parse(await response.json());
}

async function selectOrganization(context: BrowserContext, organizationId: string) {
  const response = await context.request.put(`${apiUrl}/api/orgs/context`, {
    headers,
    data: { kind: 'organization', organizationId },
  });
  expect(response.ok()).toBeTruthy();
}

test('invitation acceptance, role changes and studio switching preserve organization boundaries', async ({
  browser,
  page,
  context,
}, testInfo) => {
  await assertTestDb();
  const userIds: string[] = [];
  const organizationIds: string[] = [];
  const guestContext = await browser.newContext({ baseURL: webUrl });
  const suffix = randomUUID();
  try {
    const owner = await makeUser({
      id: `org-owner-${suffix}`,
      name: 'Studio Owner',
      email: `org-owner-${suffix}@example.test`,
      phoneNumber: `+9196${randomInt(10_000_000, 100_000_000)}`,
      phoneNumberVerified: true,
      role: 'designer',
      status: 'active',
    });
    userIds.push(owner.id);
    const guest = await makeUser({
      id: `org-guest-${suffix}`,
      name: 'Invited Teammate',
      email: `org-guest-${suffix}@example.test`,
      phoneNumber: `+9195${randomInt(10_000_000, 100_000_000)}`,
      phoneNumberVerified: true,
      role: 'visitor',
      status: 'active',
    });
    userIds.push(guest.id);
    const first = await makeOrganization({ id: `org-first-${suffix}`, name: 'Invitation Studio' });
    organizationIds.push(first.id);
    const second = await makeOrganization({
      id: `org-second-${suffix}`,
      name: 'Private Second Studio',
    });
    organizationIds.push(second.id);
    for (const organization of [first, second]) {
      await makeDesigner({
        userId: owner.id,
        orgId: organization.id,
        displayName: organization.name,
      });
      await db.insert(schema.member).values({
        id: randomUUID(),
        userId: owner.id,
        organizationId: organization.id,
        role: 'owner',
        createdAt: new Date(),
      });
      await db
        .insert(schema.subscription)
        .values({ organizationId: organization.id, planTier: 'corporate' });
    }

    await signInPhone(context, owner.phoneNumber);
    await selectOrganization(context, first.id);
    await page.goto('/designer/terms-roles');
    await expect(page.getByRole('heading', { name: 'Team & Roles' })).toBeVisible();
    await page.getByLabel('Work email').fill(guest.email);
    await page.getByLabel('Role', { exact: true }).selectOption('viewer');
    await page.getByRole('button', { name: 'Send invite', exact: true }).click();
    await expect(page.getByRole('status')).toContainText(`Invitation created for ${guest.email}`);
    const invitation = (await workspace(context)).invitations.find(
      (entry) => entry.email === guest.email,
    );
    expect(invitation?.state).toBe('pending');
    if (!invitation) throw new Error('The invitation was not persisted');

    await signInPhone(guestContext, guest.phoneNumber);
    const guestPage = await guestContext.newPage();
    await guestPage.goto(`/invitations/${invitation.id}`);
    await guestPage.getByRole('button', { name: 'Accept invitation', exact: true }).click();
    await expect(guestPage).toHaveURL(/\/designer\/terms-roles$/);
    await selectOrganization(guestContext, first.id);
    await guestPage.reload();
    await expect(guestPage.getByRole('heading', { name: 'Team & Roles' })).toBeVisible();
    await expect(guestPage.getByRole('button', { name: 'Send invite', exact: true })).toHaveCount(
      0,
    );
    const accepted = await workspace(guestContext);
    expect(accepted.currentUserRole).toBe('viewer');
    const guestMember = accepted.members.find((entry) => entry.email === guest.email);
    if (!guestMember) throw new Error('Accepted teammate membership is missing');

    const forbiddenInvite = await guestContext.request.post(
      `${apiUrl}/api/auth/organization/invite-member`,
      {
        headers,
        data: {
          organizationId: first.id,
          email: `forbidden-${suffix}@example.test`,
          role: 'member',
        },
      },
    );
    expect(forbiddenInvite.status()).toBe(403);
    const selfPromotion = await guestContext.request.post(
      `${apiUrl}/api/auth/organization/update-member-role`,
      {
        headers,
        data: { organizationId: first.id, memberId: guestMember.id, role: 'admin' },
      },
    );
    expect(selfPromotion.status()).toBe(403);
    expect((await workspace(guestContext)).currentUserRole).toBe('viewer');

    await page.reload();
    await page.getByRole('button', { name: 'Manage Invited Teammate', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Change role to Member', exact: true }).click();
    await expect.poll(async () => (await workspace(guestContext)).currentUserRole).toBe('member');
    await guestPage.reload();
    await expect(guestPage.getByRole('button', { name: 'Send invite', exact: true })).toHaveCount(
      0,
    );

    await page.getByRole('button', { name: 'Switch context', exact: true }).click();
    await page.getByRole('menuitem', { name: second.name, exact: true }).click();
    await expect(page.getByRole('button', { name: 'Switch context', exact: true })).toContainText(
      second.name,
    );
    await page.reload();
    const privateWorkspace = await workspace(context);
    expect(privateWorkspace.organization.id).toBe(second.id);
    expect(privateWorkspace.members.some((entry) => entry.email === guest.email)).toBe(false);
    await expect(page.getByText(guest.email, { exact: false })).toHaveCount(0);

    const deniedSwitch = await guestContext.request.put(`${apiUrl}/api/orgs/context`, {
      headers,
      data: { kind: 'organization', organizationId: second.id },
    });
    expect(deniedSwitch.status()).toBe(403);
    const unchanged = activeContextResponseSchema.parse(
      await (await guestContext.request.get(`${apiUrl}/api/orgs/context`)).json(),
    );
    expect(unchanged.context).toMatchObject({ kind: 'organization', organizationId: first.id });
    expect((await workspace(guestContext)).organization.id).toBe(first.id);
    await guestPage.getByRole('button', { name: 'Switch context', exact: true }).click();
    await expect(guestPage.getByRole('menuitem', { name: second.name, exact: true })).toHaveCount(
      0,
    );
    await guestPage.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Switch context', exact: true }).click();
    await page.getByRole('menuitem', { name: first.name, exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Manage Invited Teammate', exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('organization-roles.png'), fullPage: true });
  } finally {
    await guestContext.close();
    await assertTestDb();
    if (organizationIds.length)
      await db.delete(schema.organization).where(inArray(schema.organization.id, organizationIds));
    if (userIds.length) await db.delete(schema.user).where(inArray(schema.user.id, userIds));
  }
});

test('a designer recovers a branchless organization session by reselecting the studio', async ({
  page,
  context,
}, testInfo) => {
  await assertTestDb();
  const suffix = randomUUID();
  const owner = await makeUser({
    name: 'Branch Recovery Owner',
    email: `branch-recovery-${suffix}@example.test`,
    phoneNumber: `+9194${randomInt(10_000_000, 100_000_000)}`,
    phoneNumberVerified: true,
    role: 'designer',
    status: 'active',
  });
  const organization = await makeOrganization({ name: `Recovery Studio ${suffix}` });
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  try {
    await makeDesigner({ userId: owner.id, orgId: organization.id });
    await db.insert(schema.member).values({
      id: randomUUID(),
      userId: owner.id,
      organizationId: organization.id,
      role: 'owner',
      createdAt: new Date(),
    });
    await signInPhone(context, owner.phoneNumber);
    const response = await context.request.put(`${apiUrl}/api/orgs/context`, {
      headers,
      data: { kind: 'organization', organizationId: organization.id, teamId: null },
    });
    expect(response.status()).toBe(200);
    expect((await context.request.get(`${apiUrl}/api/profiles/me`)).status()).toBe(422);

    await page.goto('/designer/dashboard');
    await expect(page).toHaveURL(/\/designer\/select-studio$/);
    await expect(page.getByRole('heading', { name: 'Choose your studio' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('branch-recovery-selector.png') });
    await page.getByRole('button', { name: 'Switch context', exact: true }).click();
    await page.getByRole('menuitem', { name: organization.name, exact: true }).click();
    await expect(page).toHaveURL(/\/designer\/dashboard$/);
    await expect(page.getByRole('button', { name: 'Switch context', exact: true })).toBeVisible();
    expect((await context.request.get(`${apiUrl}/api/profiles/me`)).status()).toBe(200);
    await page.reload();
    await expect(page).toHaveURL(/\/designer\/dashboard$/);
    await expect(page.getByRole('button', { name: 'Switch context', exact: true })).toBeVisible();
    expect(pageErrors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath('branch-recovery-dashboard.png') });
  } finally {
    await assertTestDb();
    await db.delete(schema.organization).where(inArray(schema.organization.id, [organization.id]));
    await db.delete(schema.user).where(inArray(schema.user.id, [owner.id]));
  }
});
