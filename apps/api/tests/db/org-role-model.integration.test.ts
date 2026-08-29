import { describe, expect, it } from 'vitest';
import { db, schema, sql } from '@repo/db';
import { makeOrganization, makeUser } from '@repo/db/testing';
import { organizationMembershipLimit } from '@repo/auth';
import { orgsRepository } from '../../src/modules/orgs/repository.js';

async function seedMembers() {
  const organization = await makeOrganization({ slug: 'role-freeze-studio' });
  const users = await Promise.all([
    makeUser({ email: 'freeze-owner@example.com' }),
    makeUser({ email: 'freeze-oldest@example.com' }),
    makeUser({ email: 'freeze-middle@example.com' }),
    makeUser({ email: 'freeze-newest@example.com' }),
  ]);
  await db.insert(schema.member).values([
    {
      id: 'freeze-owner',
      organizationId: organization.id,
      userId: users[0]!.id,
      role: 'owner',
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
    },
    {
      id: 'freeze-oldest',
      organizationId: organization.id,
      userId: users[1]!.id,
      role: 'member',
      createdAt: new Date('2026-08-02T00:00:00.000Z'),
    },
    {
      id: 'freeze-middle',
      organizationId: organization.id,
      userId: users[2]!.id,
      role: 'viewer',
      createdAt: new Date('2026-08-03T00:00:00.000Z'),
    },
    {
      id: 'freeze-newest',
      organizationId: organization.id,
      userId: users[3]!.id,
      role: 'billing_admin',
      createdAt: new Date('2026-08-04T00:00:00.000Z'),
    },
  ]);
  return organization;
}

describe('organization role persistence and freeze transitions', () => {
  it('preserves owner when backfilling a comma-joined legacy role', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql`create temporary table member_role_backfill_fixture (role text)`);
      await tx.execute(sql`insert into member_role_backfill_fixture values ('owner,admin')`);
      await tx.execute(sql`
        update member_role_backfill_fixture
        set role = case
          when 'owner' = any(regexp_split_to_array(role, '\s*,\s*')) then 'owner'
          when 'admin' = any(regexp_split_to_array(role, '\s*,\s*')) then 'admin'
          when 'billing_admin' = any(regexp_split_to_array(role, '\s*,\s*')) then 'billing_admin'
          when 'member' = any(regexp_split_to_array(role, '\s*,\s*')) then 'member'
          when 'viewer' = any(regexp_split_to_array(role, '\s*,\s*')) then 'viewer'
          else 'member'
        end
      `);
      const result = await tx.execute<{ role: string }>(
        sql`select role from member_role_backfill_fixture`,
      );
      expect(result.rows).toEqual([{ role: 'owner' }]);
    });
  });

  it('rejects roles outside the fixed five-role model', async () => {
    const organization = await makeOrganization({ slug: 'invalid-role-studio' });
    const user = await makeUser({ email: 'invalid-role@example.com' });

    await expect(
      db.execute(sql`
        insert into member (id, organization_id, user_id, role, created_at)
        values ('invalid-role-member', ${organization.id}, ${user.id}, 'editor', now())
      `),
    ).rejects.toMatchObject({
      cause: { code: '23514', constraint: 'member_role_check' },
    });
  });

  it('freezes newest non-owners first and preserves every member row', async () => {
    const organization = await seedMembers();
    const frozenAt = new Date('2026-08-21T00:00:00.000Z');

    await expect(
      orgsRepository.freezeMembersToLimit({
        organizationId: organization.id,
        activeLimit: 1,
        now: frozenAt,
      }),
    ).resolves.toEqual(['freeze-newest', 'freeze-middle', 'freeze-oldest']);

    const members = await db
      .select({
        id: schema.member.id,
        frozen: schema.member.frozen,
        rank: schema.member.freezeRank,
      })
      .from(schema.member)
      .orderBy(schema.member.createdAt);
    expect(members).toHaveLength(4);
    expect(members.find(({ id }) => id === 'freeze-owner')).toMatchObject({ frozen: false });
    expect(members.filter(({ frozen }) => frozen).map(({ rank }) => rank)).toEqual([3, 2, 1]);
  });

  it('restores by freeze rank within target capacity and fully restores Corporate', async () => {
    const organization = await seedMembers();
    await orgsRepository.freezeMembersToLimit({
      organizationId: organization.id,
      activeLimit: 1,
      now: new Date('2026-08-21T00:00:00.000Z'),
    });

    await expect(
      orgsRepository.restoreMembersToLimit({ organizationId: organization.id, activeLimit: 2 }),
    ).resolves.toEqual(['freeze-newest']);
    await expect(
      orgsRepository.restoreMembersToLimit({ organizationId: organization.id, activeLimit: -1 }),
    ).resolves.toEqual(['freeze-middle', 'freeze-oldest']);
    await expect(orgsRepository.countActiveMembers(organization.id)).resolves.toBe(4);
  });

  it('excludes frozen rows from the invite-time seat count', async () => {
    const organization = await seedMembers();
    await db.insert(schema.subscription).values({
      organizationId: organization.id,
      planTier: 'hobby',
    });
    await orgsRepository.freezeMembersToLimit({
      organizationId: organization.id,
      activeLimit: 1,
      now: new Date('2026-08-21T00:00:00.000Z'),
    });

    await expect(orgsRepository.countActiveMembers(organization.id)).resolves.toBe(1);
    const frozenRows = await db
      .select({ id: schema.member.id })
      .from(schema.member)
      .where(sql`${schema.member.organizationId} = ${organization.id} and ${schema.member.frozen}`);
    expect(frozenRows).toHaveLength(3);
    await expect(organizationMembershipLimit(organization.id)).resolves.toBe(4);
  });
});
