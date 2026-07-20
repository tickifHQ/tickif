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

/**
 * Resolve a legacy session only when membership is unambiguous. Multi-org users
 * must choose explicitly through the organization switcher.
 */
export async function findSoleOrganizationForUser(userId: string): Promise<string | null> {
  const rows = await db
    .select({ organizationId: schema.member.organizationId })
    .from(schema.member)
    .where(eq(schema.member.userId, userId))
    .limit(2);
  return rows.length === 1 ? rows[0]!.organizationId : null;
}

/** Org roles that grant write access to org-owned resources. */
const WRITE_ROLES = ['owner', 'admin'];

/** True when the user is a member with a write-capable role (owner or admin). */
export async function isOrgWriter(userId: string, organizationId: string): Promise<boolean> {
  const [row] = await db
    .select({ role: schema.member.role })
    .from(schema.member)
    .where(
      and(eq(schema.member.userId, userId), eq(schema.member.organizationId, organizationId)),
    )
    .limit(1);
  if (!row) return false;
  return WRITE_ROLES.includes(row.role);
}
