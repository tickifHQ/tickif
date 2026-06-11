import { and, eq } from 'drizzle-orm';
import { db, schema } from '@repo/db';

/** True when the user is a member (any org-role) of the organization. */
export async function isOrgMember(userId: string, organizationId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.member.id })
    .from(schema.member)
    .where(
      and(eq(schema.member.userId, userId), eq(schema.member.organizationId, organizationId)),
    )
    .limit(1);
  return !!row;
}
