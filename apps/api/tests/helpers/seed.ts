import { db, schema } from '@repo/db';

/** Insert a designer profile + project owned by the user; returns the project id. */
export async function seedProjectOwnedBy(userId: string): Promise<string> {
  const [profile] = await db
    .insert(schema.designerProfile)
    .values({ userId, studioName: 'Studio X' })
    .returning({ id: schema.designerProfile.id });
  const [project] = await db
    .insert(schema.project)
    .values({ designerId: profile!.id, title: 'P', slug: `p-${userId}` })
    .returning({ id: schema.project.id });
  return project!.id;
}

/** Insert an organization with the user as a plain member; returns the org id. */
export async function seedOrgWithMember(userId: string): Promise<string> {
  // full userId in the ids — prefix-derived ids could collide between test users
  const orgId = `org-${userId}`;
  await db.insert(schema.organization).values({
    id: orgId,
    name: 'Acme Studio',
    slug: orgId,
    createdAt: new Date(),
  });
  await db.insert(schema.member).values({
    id: `mem-${userId}`,
    organizationId: orgId,
    userId,
    role: 'member',
    createdAt: new Date(),
  });
  return orgId;
}
