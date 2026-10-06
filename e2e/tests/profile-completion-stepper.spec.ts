import '../lib/environment';
import { randomInt, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { db, eq, schema } from '@repo/db';
import { assertTestDb, makeDesigner, makeOrganization, makeUser } from '@repo/db/testing';
import { signInPhone } from '../lib/auth';
import { apiUrl, webUrl } from '../lib/environment';

test.use({ video: 'on', viewport: { width: 1280, height: 800 } });

test('profile completion steps guide designers to missing fields on desktop and mobile', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120_000);
  await assertTestDb();
  const suffix = randomUUID();
  const owner = await makeUser({
    name: 'Profile Stepper Owner',
    email: `profile-stepper-${suffix}@example.test`,
    phoneNumber: `+9194${randomInt(10_000_000, 100_000_000)}`,
    phoneNumberVerified: true,
    role: 'designer',
    status: 'active',
  });
  const organization = await makeOrganization({ name: 'Profile Stepper Studio' });
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  try {
    const profile = await makeDesigner({
      userId: owner.id,
      orgId: organization.id,
      displayName: organization.name,
      bio: 'Thoughtful interiors for everyday living.',
    });
    await db.insert(schema.member).values({
      id: randomUUID(),
      userId: owner.id,
      organizationId: organization.id,
      role: 'owner',
      createdAt: new Date(),
    });
    await signInPhone(context, owner.phoneNumber);
    const selection = await context.request.put(`${apiUrl}/api/orgs/context`, {
      headers: { origin: webUrl },
      data: { kind: 'organization', organizationId: organization.id, teamId: profile.teamId },
    });
    expect(selection.ok()).toBeTruthy();
    await page.goto('/designer/profile');
    const steps = page.getByRole('list', { name: 'Profile completion steps' });
    await expect(steps.getByRole('listitem')).toHaveCount(6);
    await expect(steps.getByText('Complete', { exact: true })).toHaveCount(3);
    await expect(page.getByRole('progressbar', { name: 'Profile completion' })).toHaveAttribute(
      'aria-valuenow',
      '50',
    );
    await expect(page.getByRole('link', { name: 'Upload your logo' })).toHaveAttribute(
      'aria-current',
      'step',
    );
    for (const [label, viewport] of [
      ['desktop', { width: 1280, height: 800 }],
      ['mobile', { width: 390, height: 844 }],
    ] as const) {
      await page.setViewportSize(viewport);
      await steps.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: testInfo.outputPath(`profile-completion-${label}.png`),
        animations: 'disabled',
      });
      await page.getByRole('link', { name: 'Add your location' }).click();
      await expect(page.locator('#profile-address')).toBeFocused();
      await steps.scrollIntoViewIfNeeded();
      await page.getByRole('link', { name: 'Choose your services' }).click();
      await expect(page.locator('#profile-services')).toBeFocused();
    }
    expect(pageErrors).toEqual([]);
  } finally {
    await db.delete(schema.organization).where(eq(schema.organization.id, organization.id));
    await db.delete(schema.user).where(eq(schema.user.id, owner.id));
  }
});
