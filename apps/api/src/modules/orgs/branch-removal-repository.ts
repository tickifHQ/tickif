import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@repo/db';
import { recordSearchProjectionEvents } from '../search-index/repository.js';

export const BRANCH_REMOVAL_RESULT = {
  REMOVED: 'removed',
  NOT_FOUND: 'not_found',
  FORBIDDEN: 'forbidden',
  INVALID_TARGET: 'invalid_target',
  FINAL_BRANCH: 'final_branch',
  REVIEW_CONFLICT: 'review_conflict',
} as const;

type BranchRemovalFailure = (typeof BRANCH_REMOVAL_RESULT)[Exclude<
  keyof typeof BRANCH_REMOVAL_RESULT,
  'REMOVED'
>];

export type BranchRemovalResult =
  | BranchRemovalFailure
  | {
      outcome: typeof BRANCH_REMOVAL_RESULT.REMOVED;
      removedBranchId: string;
      targetBranchId: string;
      reassignedProjectCount: number;
    };

function invitationTeamIds(value: string | null): string[] {
  return value
    ? value
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    : [];
}

/**
 * Removes a branch without invoking Better Auth's cascading team deletion path.
 * Every operational foreign key is moved before the source profile is deleted.
 */
export async function removeBranchWithReassignment(input: {
  userId: string;
  organizationId: string;
  branchId: string;
  targetBranchId: string;
}): Promise<BranchRemovalResult> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`branch:${input.organizationId}`}, 0))`,
    );

    const [membership] = await tx
      .select({ role: schema.member.role, frozen: schema.member.frozen })
      .from(schema.member)
      .where(
        and(
          eq(schema.member.userId, input.userId),
          eq(schema.member.organizationId, input.organizationId),
        ),
      )
      .for('update')
      .limit(1);
    if (!membership || membership.frozen || membership.role !== 'owner') {
      return BRANCH_REMOVAL_RESULT.FORBIDDEN;
    }

    const branches = await tx
      .select({
        id: schema.team.id,
        organizationId: schema.team.organizationId,
        frozen: schema.team.frozen,
        profileId: schema.designerProfile.id,
      })
      .from(schema.team)
      .innerJoin(schema.designerProfile, eq(schema.designerProfile.teamId, schema.team.id))
      .where(inArray(schema.team.id, [input.branchId, input.targetBranchId]))
      .for('update');
    const source = branches.find(({ id }) => id === input.branchId);
    const target = branches.find(({ id }) => id === input.targetBranchId);
    if (!source || source.organizationId !== input.organizationId) {
      return BRANCH_REMOVAL_RESULT.NOT_FOUND;
    }

    const [branchCount] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.team)
      .where(eq(schema.team.organizationId, input.organizationId));
    if ((branchCount?.count ?? 0) <= 1) return BRANCH_REMOVAL_RESULT.FINAL_BRANCH;

    if (
      !target ||
      source.id === target.id ||
      target.organizationId !== input.organizationId ||
      target.frozen
    ) {
      return BRANCH_REMOVAL_RESULT.INVALID_TARGET;
    }

    const sourceReviewAuthors = await tx
      .select({ userId: schema.review.authorUserId })
      .from(schema.review)
      .where(eq(schema.review.designerProfileId, source.profileId))
      .for('update');
    const targetReviewAuthors = await tx
      .select({ userId: schema.review.authorUserId })
      .from(schema.review)
      .where(eq(schema.review.designerProfileId, target.profileId))
      .for('update');
    const targetAuthors = new Set(targetReviewAuthors.map(({ userId }) => userId));
    if (sourceReviewAuthors.some(({ userId }) => targetAuthors.has(userId))) {
      return BRANCH_REMOVAL_RESULT.REVIEW_CONFLICT;
    }

    const now = new Date();
    const movedProjects = await tx
      .update(schema.project)
      .set({ designerId: target.profileId, updatedAt: now })
      .where(eq(schema.project.designerId, source.profileId))
      .returning({ id: schema.project.id, status: schema.project.status });
    await tx
      .update(schema.lead)
      .set({ teamId: target.id, updatedAt: now })
      .where(eq(schema.lead.teamId, source.id));
    await tx
      .update(schema.enquiry)
      .set({ designerProfileId: target.profileId, updatedAt: now })
      .where(eq(schema.enquiry.designerProfileId, source.profileId));
    await tx
      .update(schema.consultationBooking)
      .set({ designerProfileId: target.profileId, updatedAt: now })
      .where(eq(schema.consultationBooking.designerProfileId, source.profileId));
    await tx
      .update(schema.review)
      .set({ designerProfileId: target.profileId, updatedAt: now })
      .where(eq(schema.review.designerProfileId, source.profileId));
    await tx
      .update(schema.session)
      .set({ activeTeamId: null, updatedAt: now })
      .where(eq(schema.session.activeTeamId, source.id));
    await tx
      .update(schema.userContextPreference)
      .set({ teamId: null, updatedAt: now })
      .where(eq(schema.userContextPreference.teamId, source.id));

    const pendingInvitations = await tx
      .select({ id: schema.invitation.id, teamId: schema.invitation.teamId })
      .from(schema.invitation)
      .where(
        and(
          eq(schema.invitation.organizationId, input.organizationId),
          eq(schema.invitation.status, 'pending'),
        ),
      )
      .for('update');
    for (const invitation of pendingInvitations) {
      const ids = invitationTeamIds(invitation.teamId);
      if (!ids.includes(source.id)) continue;
      const next = [...new Set(ids.map((id) => (id === source.id ? target.id : id)))];
      await tx
        .update(schema.invitation)
        .set({ teamId: next.join(',') })
        .where(eq(schema.invitation.id, invitation.id));
    }

    const [publishedProjects] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.project)
      .where(
        and(
          eq(schema.project.designerId, target.profileId),
          eq(schema.project.status, 'published'),
        ),
      );
    const [publishedReviews] = await tx
      .select({
        count: sql<number>`count(*)::int`,
        average: sql<string>`coalesce(round(avg(${schema.review.rating})::numeric, 2), 0)::text`,
      })
      .from(schema.review)
      .where(
        and(
          eq(schema.review.designerProfileId, target.profileId),
          eq(schema.review.status, 'published'),
        ),
      );
    await tx
      .update(schema.designerProfile)
      .set({
        projectCount: publishedProjects?.count ?? 0,
        reviewCount: publishedReviews?.count ?? 0,
        avgRating: publishedReviews?.average ?? '0',
        updatedAt: now,
      })
      .where(eq(schema.designerProfile.id, target.profileId));

    await recordSearchProjectionEvents(tx, [
      ...movedProjects
        .filter(({ status }) => status === 'published')
        .map(({ id }) => ({
          entityKind: 'project' as const,
          entityId: id,
          operation: 'index' as const,
          sourceUpdatedAt: now,
        })),
      {
        entityKind: 'designer',
        entityId: target.profileId,
        operation: 'index',
        sourceUpdatedAt: now,
      },
      {
        entityKind: 'designer',
        entityId: source.profileId,
        operation: 'delete',
        sourceUpdatedAt: now,
      },
    ]);

    await tx.delete(schema.team).where(eq(schema.team.id, source.id));
    return {
      outcome: BRANCH_REMOVAL_RESULT.REMOVED,
      removedBranchId: source.id,
      targetBranchId: target.id,
      reassignedProjectCount: movedProjects.length,
    };
  });
}
