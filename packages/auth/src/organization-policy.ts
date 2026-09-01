import { APIError } from 'better-auth/api';
import {
  organizationMemberRoleSchema,
  branchLimit,
  rbacEnabled,
  seatLimit,
  type OrganizationMemberRole,
  type PlanTier,
  type SubscriptionState,
} from '@repo/contracts';
import { and, db, eq, schema, sql } from '@repo/db';

const DEFAULT_PLAN: { tier: PlanTier; state: SubscriptionState } = {
  tier: 'hobby',
  state: 'active',
};

export const ORGANIZATION_ENTITLEMENT_ERROR = {
  code: 'ORGANIZATION_RBAC_REQUIRES_CORPORATE',
  message: 'Upgrade to Corporate to manage organization roles and members',
} as const;

export const BRANCH_ENTITLEMENT_ERROR = {
  code: 'BRANCHES_REQUIRE_CORPORATE',
  message: 'Upgrade to Corporate to create additional branches',
} as const;

async function organizationPlan(organizationId: string) {
  const [row] = await db
    .select({
      tier: schema.subscription.planTier,
      state: schema.subscription.subscriptionState,
    })
    .from(schema.subscription)
    .where(eq(schema.subscription.organizationId, organizationId))
    .limit(1);
  return row ?? DEFAULT_PLAN;
}

export async function organizationRbacEnabled(organizationId: string): Promise<boolean> {
  const plan = await organizationPlan(organizationId);
  return rbacEnabled(plan.tier, plan.state);
}

export async function requireOrganizationRbac(organizationId: string): Promise<void> {
  if (!(await organizationRbacEnabled(organizationId))) {
    throw new APIError('PAYMENT_REQUIRED', ORGANIZATION_ENTITLEMENT_ERROR);
  }
}

export async function organizationMembershipLimit(organizationId: string): Promise<number> {
  const plan = await organizationPlan(organizationId);
  const limit = seatLimit(plan.tier, plan.state);
  if (limit < 0) return Number.MAX_SAFE_INTEGER;

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.member)
    .where(and(eq(schema.member.organizationId, organizationId), eq(schema.member.frozen, true)));
  return limit + (row?.count ?? 0);
}

/** Better Auth's maximumTeams callback, resolved against tier and lifecycle state. */
export async function organizationBranchLimit(organizationId: string): Promise<number> {
  const plan = await organizationPlan(organizationId);
  const limit = branchLimit(plan.tier, plan.state);
  if (limit < 0) return Number.MAX_SAFE_INTEGER;
  if (limit <= 1) {
    throw new APIError('PAYMENT_REQUIRED', BRANCH_ENTITLEMENT_ERROR);
  }
  return limit;
}

export async function requireActiveOrganizationMember(
  userId: string,
  organizationId: string,
): Promise<OrganizationMemberRole> {
  const membership = await requireOrganizationMember(userId, organizationId);
  if (membership.frozen) {
    throw new APIError('FORBIDDEN', {
      code: 'ORGANIZATION_MEMBER_INACTIVE',
      message: 'Organization membership is inactive',
    });
  }
  return membership.role;
}

export async function requireOrganizationMember(
  userId: string,
  organizationId: string,
): Promise<{ role: OrganizationMemberRole; frozen: boolean }> {
  const [row] = await db
    .select({ frozen: schema.member.frozen, role: schema.member.role })
    .from(schema.member)
    .where(and(eq(schema.member.userId, userId), eq(schema.member.organizationId, organizationId)))
    .limit(1);
  if (!row) {
    throw new APIError('FORBIDDEN', {
      code: 'ORGANIZATION_MEMBER_REQUIRED',
      message: 'Organization membership required',
    });
  }
  return row;
}

export async function validateOrganizationRoleChange(input: {
  organizationId: string;
  newRole: string;
}): Promise<OrganizationMemberRole> {
  await requireOrganizationRbac(input.organizationId);
  const role = organizationMemberRoleSchema.safeParse(input.newRole);
  if (!role.success) {
    throw new APIError('BAD_REQUEST', {
      code: 'INVALID_ORGANIZATION_ROLE',
      message: 'Organization members must have exactly one supported role',
    });
  }
  return role.data;
}
