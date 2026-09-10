import { randomInt, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { db, eq, inArray, schema } from '@repo/db';
import { assertTestDb, makeDesigner, makeOrganization, makeUser } from '@repo/db/testing';
import { signInPhone } from '../lib/auth';
import { apiUrl, webUrl } from '../lib/environment';

test('visitor settings and designer role boundaries are enforced in the UI and API', async ({
  browser,
}) => {
  await assertTestDb();
  const suffix = randomUUID();
  const phone = (prefix: string) => `+91${prefix}${randomInt(10_000_000, 99_999_999)}`;
  const visitorPhone = phone('92');
  const visitor = await makeUser({
    name: 'Boundary Visitor',
    email: `${visitorPhone}@phone.tickif.local`,
    phoneNumber: visitorPhone,
    phoneNumberVerified: true,
    role: 'visitor',
    status: 'active',
  });
  const organization = await makeOrganization({ name: `Boundary Studio ${suffix}` });
  const designer = await makeUser({
    name: 'Boundary Designer',
    email: `designer-${suffix}@test.local`,
    phoneNumber: phone('93'),
    phoneNumberVerified: true,
    role: 'designer',
    status: 'active',
  });
  const designerWithoutContext = await makeUser({
    name: 'Boundary Designer Without Context',
    email: `designer-no-context-${suffix}@test.local`,
    phoneNumber: phone('96'),
    phoneNumberVerified: true,
    role: 'designer',
    status: 'active',
  });
  const designerProfile = await makeDesigner({ userId: designer.id, orgId: organization.id });
  await db.insert(schema.member).values([
    {
      id: randomUUID(),
      organizationId: organization.id,
      userId: designer.id,
      role: 'owner',
      createdAt: new Date(),
    },
    {
      id: randomUUID(),
      organizationId: organization.id,
      userId: designerWithoutContext.id,
      role: 'member',
      createdAt: new Date(),
    },
  ]);
  await db.insert(schema.teamMember).values({
    id: randomUUID(),
    teamId: designerProfile.teamId,
    userId: designerWithoutContext.id,
    createdAt: new Date(),
  });
  const admin = await makeUser({
    name: 'Boundary Admin',
    email: `admin-${suffix}@test.local`,
    phoneNumber: phone('94'),
    phoneNumberVerified: true,
    role: 'admin',
    status: 'active',
  });
  const superadmin = await makeUser({
    name: 'Boundary Superadmin',
    email: `superadmin-${suffix}@test.local`,
    phoneNumber: phone('95'),
    phoneNumberVerified: true,
    role: 'superadmin',
    status: 'active',
  });
  const contexts = await Promise.all(
    [visitor, designer, admin, superadmin, designerWithoutContext].map(async (account) => {
      const context = await browser.newContext({ baseURL: webUrl });
      await signInPhone(context, account.phoneNumber!);
      return context;
    }),
  );
  try {
    expect(
      (
        await contexts[1]!.request.post(`${apiUrl}/api/auth/organization/set-active`, {
          headers: { origin: webUrl },
          data: { organizationId: organization.id },
        })
      ).ok(),
    ).toBeTruthy();
    expect(
      (
        await contexts[1]!.request.post(`${apiUrl}/api/auth/organization/set-active-team`, {
          headers: { origin: webUrl },
          data: { teamId: designerProfile.teamId },
        })
      ).ok(),
    ).toBeTruthy();

    const visitorPage = await contexts[0]!.newPage();
    await visitorPage.goto('/home');
    await expect(visitorPage).toHaveURL(`${webUrl}/home`);
    await visitorPage.getByRole('link', { name: 'List your work' }).click();
    await expect(visitorPage).toHaveURL(`${webUrl}/home/list-your-work`);
    await expect(
      visitorPage.getByRole('heading', { name: 'Use a separate designer account' }),
    ).toBeVisible();
    await visitorPage.goto('/designer/onboarding');
    await expect(visitorPage).toHaveURL(`${webUrl}/home/list-your-work`);
    await visitorPage.goto('/home/settings');
    await expect(visitorPage.getByText('Not added')).toBeVisible();

    const directOnboarding = await contexts[0]!.request.post(`${apiUrl}/api/profiles/me`, {
      headers: { origin: webUrl },
      data: { entityType: 'individual', userName: 'Converted Visitor' },
    });
    expect(directOnboarding.status()).toBe(403);
    const directOrganization = await contexts[0]!.request.post(`${apiUrl}/api/orgs`, {
      headers: { origin: webUrl },
      data: { entityType: 'individual', userName: 'Converted Visitor Organization' },
    });
    expect(directOrganization.status()).toBe(403);
    const [unchangedVisitor] = await db
      .select({ role: schema.user.role, status: schema.user.status })
      .from(schema.user)
      .where(eq(schema.user.id, visitor.id));
    expect(unchangedVisitor).toEqual({ role: 'visitor', status: 'active' });
    const [visitorDesignerProfile] = await db
      .select({ id: schema.designerProfile.id })
      .from(schema.designerProfile)
      .where(eq(schema.designerProfile.userId, visitor.id));
    expect(visitorDesignerProfile).toBeUndefined();

    for (const [index, destination] of [
      [1, '/designer/dashboard'],
      [2, '/dashboard'],
      [3, '/dashboard'],
    ] as const) {
      const page = await contexts[index]!.newPage();
      await page.goto('/home');
      await expect(page).toHaveURL(new RegExp(`${destination.replace('/', '\\/')}$`));
    }

    const designerWithoutContextPage = await contexts[4]!.newPage();
    await designerWithoutContextPage.goto('/home');
    await expect(designerWithoutContextPage).toHaveURL(`${webUrl}/designer/select-studio`);
    await expect(
      designerWithoutContextPage.getByRole('heading', { name: 'Choose your studio' }),
    ).toBeVisible();
    await designerWithoutContextPage.getByRole('button', { name: 'Switch context' }).click();
    await designerWithoutContextPage
      .getByRole('menuitem', { name: organization.name, exact: true })
      .click();
    await expect(designerWithoutContextPage).toHaveURL(`${webUrl}/designer/dashboard`);
  } finally {
    await Promise.allSettled(contexts.map((context) => context.close()));
    await assertTestDb();
    await db.delete(schema.organization).where(eq(schema.organization.id, organization.id));
    await db
      .delete(schema.user)
      .where(
        inArray(schema.user.id, [
          visitor.id,
          designer.id,
          admin.id,
          superadmin.id,
          designerWithoutContext.id,
        ]),
      );
  }
});
