import '../lib/environment';
import { randomInt, randomUUID } from 'node:crypto';
import { expect, test, type BrowserContext } from '@playwright/test';
import { organizationWorkspaceResponseSchema } from '@repo/contracts';
import { db, eq, inArray, schema } from '@repo/db';
import { assertTestDb, makeDesigner, makeOrganization, makeUser } from '@repo/db/testing';
import { signInPhone } from '../lib/auth';
import { apiUrl, webUrl } from '../lib/environment';

test('ownership transfer requires nominee acceptance and preserves roles after cancellation and decline', async ({
  browser,
  page,
  context,
}, testInfo) => {
  test.setTimeout(90_000);
  await assertTestDb();
  const suffix = randomUUID();
  const userIds: string[] = [];
  const targetContext = await browser.newContext({ baseURL: webUrl });
  const organization = await makeOrganization({ name: `Transfer Studio ${suffix}` });
  const headers = { origin: webUrl };
  const readWorkspace = async (session: BrowserContext) => {
    const response = await session.request.get(`${apiUrl}/api/orgs/current`);
    expect(response.ok()).toBeTruthy();
    return organizationWorkspaceResponseSchema.parse(await response.json());
  };
  try {
    const users = [];
    // Thirteen eligible members prove that dropdown results beyond page one are reachable.
    for (let index = 0; index < 14; index++) {
      const user = await makeUser({
        name: index === 0 ? 'Transfer Owner' : `Nominee ${String(index).padStart(2, '0')}`,
        email: `transfer-${index}-${suffix}@example.test`,
        phoneNumber: `+9193${randomInt(10_000_000, 100_000_000)}`,
        phoneNumberVerified: true,
        role: 'designer',
        status: 'active',
      });
      userIds.push(user.id);
      users.push(user);
      await db.insert(schema.member).values({
        id: randomUUID(),
        userId: user.id,
        organizationId: organization.id,
        role: index === 0 ? 'owner' : 'member',
        createdAt: new Date(),
      });
    }
    const owner = users[0]!;
    const target = users[13]!;
    const profile = await makeDesigner({ userId: owner.id, orgId: organization.id });
    await db.insert(schema.teamMember).values({
      id: randomUUID(),
      teamId: profile.teamId!,
      userId: target.id,
      createdAt: new Date(),
    });
    await db.insert(schema.subscription).values({
      organizationId: organization.id,
      planTier: 'corporate',
    });
    for (const [session, user] of [
      [context, owner],
      [targetContext, target],
    ] as const) {
      await signInPhone(session, user.phoneNumber);
      const response = await session.request.put(`${apiUrl}/api/orgs/context`, {
        headers,
        data: { kind: 'organization', organizationId: organization.id },
      });
      expect(response.ok()).toBeTruthy();
    }
    const targetPage = await targetContext.newPage();
    await page.goto('/designer/terms-roles');
    await expect(
      page.getByText('Transfer ownership or delete the organisation first'),
    ).toBeVisible();
    const nominee = page.getByRole('combobox', {
      name: 'Nominate an Admin or Member as Owner',
      exact: true,
    });
    await nominee.click();
    await expect(
      page.getByRole('option', { name: 'Nominee 13 (Member)', exact: true }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Load more options', exact: true }).click();
    await expect(
      page.getByRole('option', { name: 'Nominee 13 (Member)', exact: true }),
    ).toBeVisible();
    await nominee.fill(target.email.toUpperCase());
    await page.getByRole('option', { name: 'Nominee 13 (Member)', exact: true }).click();
    await page.getByRole('button', { name: 'Request transfer', exact: true }).click();
    await expect(
      page.getByText('Transfer to Nominee 13 is pending', { exact: true }),
    ).toBeVisible();
    expect((await readWorkspace(context)).currentUserRole).toBe('owner');
    expect((await readWorkspace(targetContext)).currentUserRole).toBe('member');
    const pending = (await readWorkspace(context)).ownershipTransfer!;
    const forbidden = await context.request.post(
      `${apiUrl}/api/orgs/ownership-transfers/${pending.id}/accept`,
      { headers },
    );
    expect(forbidden.status()).toBe(403);
    await page.getByRole('button', { name: 'Cancel request', exact: true }).click();
    await expect(nominee).toBeVisible();
    expect((await readWorkspace(context)).ownershipTransfer).toBeNull();
    await nominee.click();
    await expect(
      page.getByRole('option', { name: 'Nominee 01 (Member)', exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');

    // Name/email filtering is server-backed and stays inside the single dropdown.
    const nominateByEmail = async () => {
      await nominee.fill(target.email.toUpperCase());
      await page.getByRole('option', { name: 'Nominee 13 (Member)', exact: true }).click();
      await page.getByRole('button', { name: 'Request transfer', exact: true }).click();
      await expect(
        page.getByText('Transfer to Nominee 13 is pending', { exact: true }),
      ).toBeVisible();
    };
    await nominateByEmail();
    await targetPage.goto('/designer/terms-roles');
    await expect(
      targetPage.getByRole('button', { name: 'Accept transfer', exact: true }),
    ).toBeVisible();
    await targetPage.getByRole('button', { name: 'Decline', exact: true }).click();
    await expect(
      targetPage.getByRole('status').filter({ hasText: 'Ownership transfer declined.' }),
    ).toBeVisible();
    expect((await readWorkspace(context)).currentUserRole).toBe('owner');
    expect((await readWorkspace(targetContext)).currentUserRole).toBe('member');
    await page.reload();
    await nominateByEmail();
    await targetPage.reload();
    await targetPage.getByRole('button', { name: 'Accept transfer', exact: true }).click();
    await expect(
      targetPage.getByRole('status').filter({ hasText: 'Ownership transfer accepted.' }),
    ).toBeVisible();
    expect((await readWorkspace(targetContext)).currentUserRole).toBe('owner');
    expect((await readWorkspace(context)).currentUserRole).toBe('admin');
    await page.reload();
    await expect(nominee).toHaveCount(0);
    await expect(page.getByText('Transfer ownership or delete the organisation first')).toHaveCount(
      0,
    );
    await expect(
      targetPage.getByText('Transfer ownership or delete the organisation first'),
    ).toBeVisible();
    const memberships = await db
      .select()
      .from(schema.member)
      .where(eq(schema.member.organizationId, organization.id));
    expect(
      memberships.filter((member) => member.role === 'owner').map((member) => member.userId),
    ).toEqual([target.id]);
    await targetPage.screenshot({ path: testInfo.outputPath('new-owner.png'), fullPage: true });
    // Audit rows are retained for each resolution, not overwritten by later requests.
    const transfers = await db
      .select()
      .from(schema.ownershipTransferRequest)
      .where(eq(schema.ownershipTransferRequest.organizationId, organization.id));
    expect(transfers.map((transfer) => transfer.status).sort()).toEqual([
      'accepted',
      'cancelled',
      'declined',
    ]);
  } finally {
    await targetContext.close();
    await assertTestDb();
    await db.delete(schema.organization).where(eq(schema.organization.id, organization.id));
    if (userIds.length) await db.delete(schema.user).where(inArray(schema.user.id, userIds));
  }
});
