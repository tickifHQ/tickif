import {
  ADMIN_VERIFICATION_QUEUE_TAB,
  BUSINESS_VERIFICATION_DOCUMENT_TYPES,
  MIN_VERIFICATION_PUBLISHED_PROJECTS,
  ORGANIZATION_MEMBER_ROLE,
  VERIFICATION_APPLICATION_STATUS,
  VERIFICATION_DOCUMENT_STATUS,
  VERIFICATION_NOTIFICATION_EVENT,
  VERIFICATION_REVIEW_ACTION,
  type AdminVerificationQueueQuery,
  type AdminVerificationQueueResponse,
  type AdminVerificationQueueTab,
  type RejectVerificationInput,
  type RevokeVerificationInput,
  type VerificationApplicationStatus,
  type VerificationDocumentType,
} from '@repo/contracts';
import { and, asc, db, desc, eq, inArray, isNotNull, schema, sql } from '@repo/db';
import { recordSearchProjectionEvents } from '../search-index/repository.js';

export type VerificationApplicationRecord = typeof schema.verificationApplication.$inferSelect;
export type VerificationDocumentVersionRecord =
  typeof schema.verificationDocumentVersion.$inferSelect;
export type VerificationReviewEventRecord = typeof schema.verificationReviewEvent.$inferSelect;

export type VerificationDocumentRecord = VerificationDocumentVersionRecord & {
  type: VerificationDocumentType;
};

export type VerificationContextRecord = {
  application: VerificationApplicationRecord;
  designerProfileId: string;
  designerName: string;
  ownerUserId: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string | null;
  ownerPhoneVerified: boolean;
  publishedProjectCount: number;
};

export type AdminVerificationRecord = VerificationContextRecord & {
  organizationName: string;
};

function adminQueuePredicate(tab: AdminVerificationQueueTab) {
  if (tab === ADMIN_VERIFICATION_QUEUE_TAB.NEW) {
    return and(
      eq(schema.verificationApplication.status, VERIFICATION_APPLICATION_STATUS.PENDING),
      eq(schema.verificationApplication.attempt, 1),
    );
  }
  if (tab === ADMIN_VERIFICATION_QUEUE_TAB.RE_REVIEW) {
    return and(
      eq(schema.verificationApplication.status, VERIFICATION_APPLICATION_STATUS.PENDING),
      sql`${schema.verificationApplication.attempt} > 1`,
    );
  }
  if (tab === ADMIN_VERIFICATION_QUEUE_TAB.ACCEPTED) {
    return eq(schema.verificationApplication.status, VERIFICATION_APPLICATION_STATUS.VERIFIED);
  }
  return eq(schema.verificationApplication.status, VERIFICATION_APPLICATION_STATUS.REJECTED);
}

function isAdminQueueStatus(
  status: VerificationApplicationStatus,
): status is AdminVerificationQueueResponse['items'][number]['status'] {
  return status !== VERIFICATION_APPLICATION_STATUS.DRAFT;
}

export function isApplicationEditable(
  application: Pick<VerificationApplicationRecord, 'status' | 'expiresAt'>,
  now = new Date(),
): boolean {
  return (
    application.status === VERIFICATION_APPLICATION_STATUS.DRAFT ||
    application.status === VERIFICATION_APPLICATION_STATUS.REJECTED ||
    (application.status === VERIFICATION_APPLICATION_STATUS.VERIFIED &&
      application.expiresAt !== null &&
      application.expiresAt <= now)
  );
}

export const VERIFICATION_MUTATION_RESULT = {
  NOT_FOUND: 'not_found',
  STATE_CHANGED: 'state_changed',
  DOCUMENT_NOT_FOUND: 'document_not_found',
  INVALID_DOCUMENTS: 'invalid_documents',
  INELIGIBLE: 'ineligible',
} as const;

type VerificationMutationFailure =
  (typeof VERIFICATION_MUTATION_RESULT)[keyof typeof VERIFICATION_MUTATION_RESULT];

type VerificationReviewInput =
  | {
      applicationId: string;
      reviewerId: string;
      decision: 'approve';
      expiresAt: Date;
      rejection?: never;
    }
  | {
      applicationId: string;
      reviewerId: string;
      decision: 'reject';
      rejection: RejectVerificationInput;
      expiresAt?: never;
    };

function ownerRolePredicate(): ReturnType<typeof sql> {
  return sql`${ORGANIZATION_MEMBER_ROLE.OWNER} = any(string_to_array(replace(${schema.member.role}, ' ', ''), ','))`;
}

async function findOwner(organizationId: string) {
  const [owner] = await db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      email: schema.user.email,
      phone: schema.user.phoneNumber,
      phoneVerified: schema.user.phoneNumberVerified,
    })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .where(and(eq(schema.member.organizationId, organizationId), ownerRolePredicate()))
    .orderBy(asc(schema.member.createdAt), asc(schema.member.id))
    .limit(1);
  return owner ?? null;
}

async function findPrimaryProfile(organizationId: string) {
  const [profile] = await db
    .select({
      id: schema.designerProfile.id,
      displayName: schema.designerProfile.displayName,
    })
    .from(schema.designerProfile)
    .where(eq(schema.designerProfile.orgId, organizationId))
    .orderBy(asc(schema.designerProfile.createdAt), asc(schema.designerProfile.id))
    .limit(1);
  return profile ?? null;
}

async function publishedProjectCount(organizationId: string): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(schema.project)
    .innerJoin(schema.designerProfile, eq(schema.project.designerId, schema.designerProfile.id))
    .where(
      and(
        eq(schema.designerProfile.orgId, organizationId),
        eq(schema.project.status, 'published'),
      ),
    );
  return row?.value ?? 0;
}

async function contextForApplication(
  application: VerificationApplicationRecord,
): Promise<VerificationContextRecord | null> {
  const [profile, owner] = await Promise.all([
    findPrimaryProfile(application.organizationId),
    findOwner(application.organizationId),
  ]);
  if (!profile || !owner) return null;
  return {
    application,
    designerProfileId: profile.id,
    designerName: profile.displayName,
    ownerUserId: owner.id,
    ownerName: owner.name,
    ownerEmail: owner.email,
    ownerPhone: owner.phone,
    ownerPhoneVerified: owner.phoneVerified === true,
    publishedProjectCount: await publishedProjectCount(application.organizationId),
  };
}

export const verificationsRepository = {
  async getOrCreateForOrganization(organizationId: string): Promise<VerificationApplicationRecord> {
    await db
      .insert(schema.verificationApplication)
      .values({ organizationId })
      .onConflictDoNothing({ target: schema.verificationApplication.organizationId });
    const [application] = await db
      .select()
      .from(schema.verificationApplication)
      .where(eq(schema.verificationApplication.organizationId, organizationId))
      .limit(1);
    if (!application) throw new Error('Verification application insert did not persist');
    return application;
  },

  async findContextByOrganization(
    organizationId: string,
  ): Promise<VerificationContextRecord | null> {
    const [application] = await db
      .select()
      .from(schema.verificationApplication)
      .where(eq(schema.verificationApplication.organizationId, organizationId))
      .limit(1);
    return application ? contextForApplication(application) : null;
  },

  async hasIncompleteDocument(applicationId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: schema.verificationDocumentVersion.id })
      .from(schema.verificationDocumentVersion)
      .innerJoin(
        schema.verificationDocumentSlot,
        eq(schema.verificationDocumentVersion.slotId, schema.verificationDocumentSlot.id),
      )
      .where(
        and(
          eq(schema.verificationDocumentSlot.applicationId, applicationId),
          eq(
            schema.verificationDocumentVersion.status,
            VERIFICATION_DOCUMENT_STATUS.PENDING_UPLOAD,
          ),
          sql`not exists (
            select 1 from verification_document_version newer
            where newer.slot_id = ${schema.verificationDocumentVersion.slotId}
              and newer.version > ${schema.verificationDocumentVersion.version}
          )`,
        ),
      )
      .limit(1);
    return !!row;
  },

  async listDocuments(applicationId: string): Promise<VerificationDocumentRecord[]> {
    const rows = await db
      .select({
        version: schema.verificationDocumentVersion,
        type: schema.verificationDocumentSlot.type,
      })
      .from(schema.verificationDocumentVersion)
      .innerJoin(
        schema.verificationDocumentSlot,
        eq(schema.verificationDocumentVersion.slotId, schema.verificationDocumentSlot.id),
      )
      .where(eq(schema.verificationDocumentSlot.applicationId, applicationId))
      .orderBy(
        asc(schema.verificationDocumentSlot.type),
        desc(schema.verificationDocumentVersion.version),
      );
    return rows.map((row) => ({ ...row.version, type: row.type }));
  },

  async listHistory(applicationId: string): Promise<VerificationReviewEventRecord[]> {
    return db
      .select()
      .from(schema.verificationReviewEvent)
      .where(eq(schema.verificationReviewEvent.applicationId, applicationId))
      .orderBy(
        asc(schema.verificationReviewEvent.createdAt),
        asc(schema.verificationReviewEvent.id),
      );
  },

  async reserveDocumentVersion(input: {
    applicationId: string;
    documentVersionId: string;
    type: VerificationDocumentType;
    objectKey: string;
    contentType: string;
    contentLength: number;
    userId: string;
  }): Promise<VerificationDocumentVersionRecord | VerificationMutationFailure> {
    return db.transaction(async (tx) => {
      // Every document mutation takes the application lock before any slot or
      // version lock so concurrent upload, commit, cancel, and remove paths use
      // one consistent lock order.
      const [application] = await tx
        .select({
          status: schema.verificationApplication.status,
          expiresAt: schema.verificationApplication.expiresAt,
        })
        .from(schema.verificationApplication)
        .where(eq(schema.verificationApplication.id, input.applicationId))
        .for('update')
        .limit(1);
      if (!application) return VERIFICATION_MUTATION_RESULT.NOT_FOUND;
      if (!isApplicationEditable(application)) {
        return VERIFICATION_MUTATION_RESULT.STATE_CHANGED;
      }

      await tx
        .insert(schema.verificationDocumentSlot)
        .values({ applicationId: input.applicationId, type: input.type })
        .onConflictDoNothing({
          target: [
            schema.verificationDocumentSlot.applicationId,
            schema.verificationDocumentSlot.type,
          ],
        });
      const [slot] = await tx
        .select({ id: schema.verificationDocumentSlot.id })
        .from(schema.verificationDocumentSlot)
        .where(
          and(
            eq(schema.verificationDocumentSlot.applicationId, input.applicationId),
            eq(schema.verificationDocumentSlot.type, input.type),
          ),
        )
        .for('update')
        .limit(1);
      if (!slot) throw new Error('Verification document slot insert did not persist');

      const [latest] = await tx
        .select({ version: schema.verificationDocumentVersion.version })
        .from(schema.verificationDocumentVersion)
        .where(eq(schema.verificationDocumentVersion.slotId, slot.id))
        .orderBy(desc(schema.verificationDocumentVersion.version))
        .limit(1);
      const [created] = await tx
        .insert(schema.verificationDocumentVersion)
        .values({
          id: input.documentVersionId,
          slotId: slot.id,
          version: (latest?.version ?? 0) + 1,
          objectKey: input.objectKey,
          contentType: input.contentType,
          contentLength: input.contentLength,
          uploadedByUserId: input.userId,
        })
        .returning();
      if (!created) throw new Error('Verification document version insert failed');
      return created;
    });
  },

  async findDocumentForOrganization(
    versionId: string,
    organizationId: string,
  ): Promise<VerificationDocumentRecord | null> {
    const [row] = await db
      .select({
        version: schema.verificationDocumentVersion,
        type: schema.verificationDocumentSlot.type,
      })
      .from(schema.verificationDocumentVersion)
      .innerJoin(
        schema.verificationDocumentSlot,
        eq(schema.verificationDocumentVersion.slotId, schema.verificationDocumentSlot.id),
      )
      .innerJoin(
        schema.verificationApplication,
        eq(schema.verificationDocumentSlot.applicationId, schema.verificationApplication.id),
      )
      .where(
        and(
          eq(schema.verificationDocumentVersion.id, versionId),
          eq(schema.verificationApplication.organizationId, organizationId),
        ),
      )
      .limit(1);
    return row ? { ...row.version, type: row.type } : null;
  },

  async commitDocument(
    versionId: string,
    organizationId: string,
  ): Promise<VerificationDocumentVersionRecord | VerificationMutationFailure> {
    return db.transaction(async (tx) => {
      const [application] = await tx
        .select()
        .from(schema.verificationApplication)
        .where(eq(schema.verificationApplication.organizationId, organizationId))
        .for('update')
        .limit(1);
      if (!application) return VERIFICATION_MUTATION_RESULT.DOCUMENT_NOT_FOUND;

      const [row] = await tx
        .select({
          version: schema.verificationDocumentVersion,
        })
        .from(schema.verificationDocumentVersion)
        .innerJoin(
          schema.verificationDocumentSlot,
          eq(schema.verificationDocumentVersion.slotId, schema.verificationDocumentSlot.id),
        )
        .where(
          and(
            eq(schema.verificationDocumentVersion.id, versionId),
            eq(schema.verificationDocumentSlot.applicationId, application.id),
          ),
        )
        .for('update')
        .limit(1);
      if (!row) return VERIFICATION_MUTATION_RESULT.DOCUMENT_NOT_FOUND;
      if (
        !isApplicationEditable(application) ||
        row.version.status !== VERIFICATION_DOCUMENT_STATUS.PENDING_UPLOAD
      ) {
        return VERIFICATION_MUTATION_RESULT.STATE_CHANGED;
      }
      const [updated] = await tx
        .update(schema.verificationDocumentVersion)
        .set({ status: VERIFICATION_DOCUMENT_STATUS.UPLOADED, committedAt: new Date() })
        .where(eq(schema.verificationDocumentVersion.id, versionId))
        .returning();
      if (!updated) throw new Error('Verification document commit failed');
      return updated;
    });
  },

  async cancelPendingDocument(
    versionId: string,
    organizationId: string,
  ): Promise<VerificationDocumentRecord | VerificationMutationFailure> {
    return db.transaction(async (tx) => {
      const [application] = await tx
        .select({ id: schema.verificationApplication.id })
        .from(schema.verificationApplication)
        .where(eq(schema.verificationApplication.organizationId, organizationId))
        .for('update')
        .limit(1);
      if (!application) return VERIFICATION_MUTATION_RESULT.DOCUMENT_NOT_FOUND;

      const [row] = await tx
        .select({
          version: schema.verificationDocumentVersion,
          type: schema.verificationDocumentSlot.type,
        })
        .from(schema.verificationDocumentVersion)
        .innerJoin(
          schema.verificationDocumentSlot,
          eq(schema.verificationDocumentVersion.slotId, schema.verificationDocumentSlot.id),
        )
        .where(
          and(
            eq(schema.verificationDocumentVersion.id, versionId),
            eq(schema.verificationDocumentSlot.applicationId, application.id),
          ),
        )
        .for('update')
        .limit(1);
      if (!row) return VERIFICATION_MUTATION_RESULT.DOCUMENT_NOT_FOUND;
      if (row.version.status !== VERIFICATION_DOCUMENT_STATUS.PENDING_UPLOAD) {
        return VERIFICATION_MUTATION_RESULT.STATE_CHANGED;
      }
      await tx
        .delete(schema.verificationDocumentVersion)
        .where(eq(schema.verificationDocumentVersion.id, versionId));
      return { ...row.version, type: row.type };
    });
  },

  async removeCommittedDocument(
    versionId: string,
    organizationId: string,
    userId: string,
  ): Promise<VerificationDocumentRecord | VerificationMutationFailure> {
    return db.transaction(async (tx) => {
      const [application] = await tx
        .select()
        .from(schema.verificationApplication)
        .where(eq(schema.verificationApplication.organizationId, organizationId))
        .for('update')
        .limit(1);
      if (!application) return VERIFICATION_MUTATION_RESULT.DOCUMENT_NOT_FOUND;

      const [row] = await tx
        .select({
          version: schema.verificationDocumentVersion,
          type: schema.verificationDocumentSlot.type,
        })
        .from(schema.verificationDocumentVersion)
        .innerJoin(
          schema.verificationDocumentSlot,
          eq(schema.verificationDocumentVersion.slotId, schema.verificationDocumentSlot.id),
        )
        .where(
          and(
            eq(schema.verificationDocumentVersion.id, versionId),
            eq(schema.verificationDocumentSlot.applicationId, application.id),
          ),
        )
        .for('update')
        .limit(1);
      if (!row) return VERIFICATION_MUTATION_RESULT.DOCUMENT_NOT_FOUND;

      if (
        !isApplicationEditable(application) ||
        row.version.status === VERIFICATION_DOCUMENT_STATUS.PENDING_UPLOAD ||
        row.version.status === VERIFICATION_DOCUMENT_STATUS.REMOVED
      ) {
        return VERIFICATION_MUTATION_RESULT.STATE_CHANGED;
      }

      const [newer] = await tx
        .select({ id: schema.verificationDocumentVersion.id })
        .from(schema.verificationDocumentVersion)
        .where(
          and(
            eq(schema.verificationDocumentVersion.slotId, row.version.slotId),
            sql`${schema.verificationDocumentVersion.version} > ${row.version.version}`,
          ),
        )
        .limit(1);
      if (newer) return VERIFICATION_MUTATION_RESULT.STATE_CHANGED;

      const removedAt = new Date();
      const [removed] = await tx
        .update(schema.verificationDocumentVersion)
        .set({
          status: VERIFICATION_DOCUMENT_STATUS.REMOVED,
          removedAt,
          removedByUserId: userId,
        })
        .where(eq(schema.verificationDocumentVersion.id, versionId))
        .returning();
      if (!removed) throw new Error('Verification document removal failed');
      return { ...removed, type: row.type };
    });
  },

  async submit(input: {
    applicationId: string;
    userId: string;
    expectedStatus: VerificationApplicationStatus;
  }): Promise<VerificationApplicationRecord | VerificationMutationFailure> {
    return db.transaction(async (tx) => {
      const [application] = await tx
        .select()
        .from(schema.verificationApplication)
        .where(eq(schema.verificationApplication.id, input.applicationId))
        .for('update')
        .limit(1);
      if (!application) return VERIFICATION_MUTATION_RESULT.NOT_FOUND;
      if (application.status !== input.expectedStatus) {
        return VERIFICATION_MUTATION_RESULT.STATE_CHANGED;
      }
      if (
        application.status === VERIFICATION_APPLICATION_STATUS.VERIFIED &&
        (!application.expiresAt || application.expiresAt > new Date())
      ) {
        return VERIFICATION_MUTATION_RESULT.STATE_CHANGED;
      }

      const [profile] = await tx
        .select({ id: schema.designerProfile.id })
        .from(schema.designerProfile)
        .where(eq(schema.designerProfile.orgId, application.organizationId))
        .orderBy(asc(schema.designerProfile.createdAt), asc(schema.designerProfile.id))
        .limit(1);
      const [owner] = await tx
        .select({
          name: schema.user.name,
          phone: schema.user.phoneNumber,
          phoneVerified: schema.user.phoneNumberVerified,
        })
        .from(schema.member)
        .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
        .where(
          and(eq(schema.member.organizationId, application.organizationId), ownerRolePredicate()),
        )
        .orderBy(asc(schema.member.createdAt), asc(schema.member.id))
        .limit(1);
      if (
        !profile ||
        !owner ||
        !owner.phone ||
        owner.phoneVerified !== true ||
        owner.name.trim().length < 2
      ) {
        return VERIFICATION_MUTATION_RESULT.INVALID_DOCUMENTS;
      }
      const [projectCount] = await tx
        .select({ value: sql<number>`count(*)::int` })
        .from(schema.project)
        .where(
          and(eq(schema.project.designerId, profile.id), eq(schema.project.status, 'published')),
        );
      const currentDocuments = await tx
        .select({
          type: schema.verificationDocumentSlot.type,
          status: schema.verificationDocumentVersion.status,
        })
        .from(schema.verificationDocumentVersion)
        .innerJoin(
          schema.verificationDocumentSlot,
          eq(schema.verificationDocumentVersion.slotId, schema.verificationDocumentSlot.id),
        )
        .where(
          and(
            eq(schema.verificationDocumentSlot.applicationId, application.id),
            sql`not exists (
              select 1 from verification_document_version newer
              where newer.slot_id = ${schema.verificationDocumentVersion.slotId}
                and newer.version > ${schema.verificationDocumentVersion.version}
            )`,
          ),
        );
      const businessTypes = new Set<VerificationDocumentType>(BUSINESS_VERIFICATION_DOCUMENT_TYPES);
      const hasIncompleteDocument = currentDocuments.some(
        (document) => document.status === VERIFICATION_DOCUMENT_STATUS.PENDING_UPLOAD,
      );
      const hasRejectedDocument = currentDocuments.some(
        (document) => document.status === VERIFICATION_DOCUMENT_STATUS.REJECTED,
      );
      const hasCurrentBusinessDocument = currentDocuments.some(
        (document) =>
          businessTypes.has(document.type) &&
          (document.status === VERIFICATION_DOCUMENT_STATUS.UPLOADED ||
            document.status === VERIFICATION_DOCUMENT_STATUS.VERIFIED),
      );
      if (
        hasIncompleteDocument ||
        hasRejectedDocument ||
        !hasCurrentBusinessDocument ||
        (projectCount?.value ?? 0) < MIN_VERIFICATION_PUBLISHED_PROJECTS
      ) {
        return VERIFICATION_MUTATION_RESULT.INVALID_DOCUMENTS;
      }
      const nextAttempt =
        input.expectedStatus === VERIFICATION_APPLICATION_STATUS.REJECTED ||
        input.expectedStatus === VERIFICATION_APPLICATION_STATUS.VERIFIED
          ? application.attempt + 1
          : application.attempt;
      const submittedAt = new Date();
      const [updated] = await tx
        .update(schema.verificationApplication)
        .set({
          status: VERIFICATION_APPLICATION_STATUS.PENDING,
          attempt: nextAttempt,
          submittedAt,
          reviewedAt: null,
          reviewedByUserId: null,
          approvedAt: null,
          expiresAt: null,
          updatedAt: submittedAt,
        })
        .where(eq(schema.verificationApplication.id, application.id))
        .returning();
      await tx.insert(schema.verificationReviewEvent).values({
        applicationId: application.id,
        attempt: nextAttempt,
        action:
          input.expectedStatus === VERIFICATION_APPLICATION_STATUS.REJECTED ||
          input.expectedStatus === VERIFICATION_APPLICATION_STATUS.VERIFIED
            ? VERIFICATION_REVIEW_ACTION.RESUBMITTED
            : VERIFICATION_REVIEW_ACTION.SUBMITTED,
        actorUserId: input.userId,
        fromStatus: application.status,
        toStatus: VERIFICATION_APPLICATION_STATUS.PENDING,
      });
      if (!updated) throw new Error('Verification submission update failed');
      return updated;
    });
  },

  async listAdminQueue(query: AdminVerificationQueueQuery): Promise<{
    items: Array<{
      id: string;
      organizationId: string;
      organizationName: string;
      designerName: string;
      attempt: number;
      status: AdminVerificationQueueResponse['items'][number]['status'];
      submittedAt: Date;
      reviewedAt: Date | null;
      documentCount: number;
    }>;
    total: number;
  }> {
    const queuePredicate = and(
      adminQueuePredicate(query.tab),
      isNotNull(schema.verificationApplication.submittedAt),
    );
    const currentDocuments = db
      .select({
        applicationId: schema.verificationDocumentSlot.applicationId,
        count: sql<number>`count(distinct ${schema.verificationDocumentSlot.id})::int`.as(
          'document_count',
        ),
      })
      .from(schema.verificationDocumentSlot)
      .innerJoin(
        schema.verificationDocumentVersion,
        eq(schema.verificationDocumentVersion.slotId, schema.verificationDocumentSlot.id),
      )
      .where(
        and(
          inArray(schema.verificationDocumentVersion.status, [
            VERIFICATION_DOCUMENT_STATUS.UPLOADED,
            VERIFICATION_DOCUMENT_STATUS.VERIFIED,
            VERIFICATION_DOCUMENT_STATUS.REJECTED,
          ]),
          sql`not exists (
            select 1 from verification_document_version newer
            where newer.slot_id = ${schema.verificationDocumentVersion.slotId}
              and newer.version > ${schema.verificationDocumentVersion.version}
          )`,
        ),
      )
      .groupBy(schema.verificationDocumentSlot.applicationId)
      .as('current_documents');
    const [items, [count]] = await Promise.all([
      db
        .select({
          id: schema.verificationApplication.id,
          organizationId: schema.verificationApplication.organizationId,
          organizationName: schema.organization.name,
          designerName: sql<string>`(
            select ${schema.designerProfile.displayName}
            from ${schema.designerProfile}
            where ${schema.designerProfile.orgId} = ${schema.verificationApplication.organizationId}
            order by ${schema.designerProfile.createdAt}, ${schema.designerProfile.id}
            limit 1
          )`,
          attempt: schema.verificationApplication.attempt,
          status: schema.verificationApplication.status,
          submittedAt: schema.verificationApplication.submittedAt,
          reviewedAt: schema.verificationApplication.reviewedAt,
          documentCount: sql<number>`coalesce(${currentDocuments.count}, 0)::int`,
        })
        .from(schema.verificationApplication)
        .innerJoin(
          schema.organization,
          eq(schema.verificationApplication.organizationId, schema.organization.id),
        )
        .leftJoin(
          currentDocuments,
          eq(schema.verificationApplication.id, currentDocuments.applicationId),
        )
        .where(queuePredicate)
        .orderBy(
          query.tab === ADMIN_VERIFICATION_QUEUE_TAB.NEW ||
            query.tab === ADMIN_VERIFICATION_QUEUE_TAB.RE_REVIEW
            ? asc(schema.verificationApplication.submittedAt)
            : desc(schema.verificationApplication.reviewedAt),
          query.tab === ADMIN_VERIFICATION_QUEUE_TAB.NEW ||
            query.tab === ADMIN_VERIFICATION_QUEUE_TAB.RE_REVIEW
            ? asc(schema.verificationApplication.id)
            : desc(schema.verificationApplication.id),
        )
        .limit(query.limit)
        .offset((query.page - 1) * query.limit),
      db
        .select({ value: sql<number>`count(*)::int` })
        .from(schema.verificationApplication)
        .innerJoin(
          schema.organization,
          eq(schema.verificationApplication.organizationId, schema.organization.id),
        )
        .innerJoin(
          schema.designerProfile,
          eq(schema.verificationApplication.organizationId, schema.designerProfile.orgId),
        )
        .where(queuePredicate),
    ]);
    return {
      items: items.flatMap((item) =>
        item.submittedAt && isAdminQueueStatus(item.status)
          ? [{ ...item, submittedAt: item.submittedAt, status: item.status }]
          : [],
      ),
      total: count?.value ?? 0,
    };
  },

  async findAdminDetail(applicationId: string): Promise<AdminVerificationRecord | null> {
    const [row] = await db
      .select({
        application: schema.verificationApplication,
        organizationName: schema.organization.name,
      })
      .from(schema.verificationApplication)
      .innerJoin(
        schema.organization,
        eq(schema.verificationApplication.organizationId, schema.organization.id),
      )
      .where(
        and(
          eq(schema.verificationApplication.id, applicationId),
          inArray(schema.verificationApplication.status, [
            VERIFICATION_APPLICATION_STATUS.PENDING,
            VERIFICATION_APPLICATION_STATUS.VERIFIED,
            VERIFICATION_APPLICATION_STATUS.REJECTED,
          ]),
        ),
      )
      .limit(1);
    if (!row) return null;
    const [owner, profile] = await Promise.all([
      findOwner(row.application.organizationId),
      findPrimaryProfile(row.application.organizationId),
    ]);
    if (!owner || !profile) return null;
    return {
      ...row,
      designerProfileId: profile.id,
      designerName: profile.displayName,
      ownerUserId: owner.id,
      ownerName: owner.name,
      ownerEmail: owner.email,
      ownerPhone: owner.phone,
      ownerPhoneVerified: owner.phoneVerified === true,
      publishedProjectCount: await publishedProjectCount(row.application.organizationId),
    };
  },

  async review(
    input: VerificationReviewInput,
  ): Promise<VerificationApplicationRecord | VerificationMutationFailure> {
    return db.transaction(async (tx) => {
      const [application] = await tx
        .select()
        .from(schema.verificationApplication)
        .where(eq(schema.verificationApplication.id, input.applicationId))
        .for('update')
        .limit(1);
      if (!application) return VERIFICATION_MUTATION_RESULT.NOT_FOUND;
      if (application.status !== VERIFICATION_APPLICATION_STATUS.PENDING) {
        return VERIFICATION_MUTATION_RESULT.STATE_CHANGED;
      }

      const documentRows = await tx
        .select({
          id: schema.verificationDocumentVersion.id,
          type: schema.verificationDocumentSlot.type,
          status: schema.verificationDocumentVersion.status,
        })
        .from(schema.verificationDocumentVersion)
        .innerJoin(
          schema.verificationDocumentSlot,
          eq(schema.verificationDocumentVersion.slotId, schema.verificationDocumentSlot.id),
        )
        .where(
          and(
            eq(schema.verificationDocumentSlot.applicationId, application.id),
            sql`not exists (
              select 1 from verification_document_version newer
              where newer.slot_id = ${schema.verificationDocumentVersion.slotId}
                and newer.version > ${schema.verificationDocumentVersion.version}
            )`,
          ),
        );
      const activeDocuments = documentRows.filter(
        (document) => document.status !== VERIFICATION_DOCUMENT_STATUS.REMOVED,
      );
      const reviewableDocuments = activeDocuments.filter(
        (document) =>
          document.status === VERIFICATION_DOCUMENT_STATUS.UPLOADED ||
          document.status === VERIFICATION_DOCUMENT_STATUS.VERIFIED,
      );
      const currentIds = reviewableDocuments.map((row) => row.id);
      if (currentIds.length === 0) return VERIFICATION_MUTATION_RESULT.INVALID_DOCUMENTS;

      const rejectedIds =
        input.decision === 'reject' ? input.rejection.rejectedDocumentVersionIds : [];
      if (rejectedIds.some((id) => !currentIds.includes(id))) {
        return VERIFICATION_MUTATION_RESULT.INVALID_DOCUMENTS;
      }

      const reviewedAt = new Date();
      const approved = input.decision === 'approve';
      if (!approved && rejectedIds.length === 0) {
        return VERIFICATION_MUTATION_RESULT.INVALID_DOCUMENTS;
      }
      if (approved) {
        const [profile] = await tx
          .select({ id: schema.designerProfile.id })
          .from(schema.designerProfile)
          .where(eq(schema.designerProfile.orgId, application.organizationId))
          .limit(1);
        const [owner] = await tx
          .select({
            name: schema.user.name,
            phone: schema.user.phoneNumber,
            phoneVerified: schema.user.phoneNumberVerified,
          })
          .from(schema.member)
          .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
          .where(
            and(eq(schema.member.organizationId, application.organizationId), ownerRolePredicate()),
          )
          .orderBy(asc(schema.member.createdAt), asc(schema.member.id))
          .limit(1);
        if (
          !profile ||
          !owner ||
          !owner.phone ||
          owner.phoneVerified !== true ||
          owner.name.trim().length < 2 ||
          activeDocuments.some(
            (document) =>
              document.status !== VERIFICATION_DOCUMENT_STATUS.UPLOADED &&
              document.status !== VERIFICATION_DOCUMENT_STATUS.VERIFIED,
          )
        ) {
          return VERIFICATION_MUTATION_RESULT.INELIGIBLE;
        }
        const [projectCount] = await tx
          .select({ value: sql<number>`count(*)::int` })
          .from(schema.project)
          .where(
            and(eq(schema.project.designerId, profile.id), eq(schema.project.status, 'published')),
          );
        const businessTypes = new Set<VerificationDocumentType>(
          BUSINESS_VERIFICATION_DOCUMENT_TYPES,
        );
        if (
          (projectCount?.value ?? 0) < MIN_VERIFICATION_PUBLISHED_PROJECTS ||
          !reviewableDocuments.some((document) => businessTypes.has(document.type))
        ) {
          return VERIFICATION_MUTATION_RESULT.INELIGIBLE;
        }
      }
      const nextStatus = approved
        ? VERIFICATION_APPLICATION_STATUS.VERIFIED
        : VERIFICATION_APPLICATION_STATUS.REJECTED;
      const [updated] = await tx
        .update(schema.verificationApplication)
        .set({
          status: nextStatus,
          reviewedAt,
          reviewedByUserId: input.reviewerId,
          approvedAt: approved ? reviewedAt : null,
          expiresAt: approved ? input.expiresAt : null,
          updatedAt: reviewedAt,
        })
        .where(eq(schema.verificationApplication.id, application.id))
        .returning();
      if (!updated) throw new Error('Verification review update failed');

      if (approved) {
        await tx
          .update(schema.verificationDocumentVersion)
          .set({
            status: VERIFICATION_DOCUMENT_STATUS.VERIFIED,
            reviewedAt,
            reviewedByUserId: input.reviewerId,
          })
          .where(inArray(schema.verificationDocumentVersion.id, currentIds));
      } else if (rejectedIds.length > 0) {
        await tx
          .update(schema.verificationDocumentVersion)
          .set({
            status: VERIFICATION_DOCUMENT_STATUS.REJECTED,
            reviewedAt,
            reviewedByUserId: input.reviewerId,
          })
          .where(inArray(schema.verificationDocumentVersion.id, rejectedIds));
        const acceptedIds = currentIds.filter((id) => !rejectedIds.includes(id));
        if (acceptedIds.length > 0) {
          await tx
            .update(schema.verificationDocumentVersion)
            .set({
              status: VERIFICATION_DOCUMENT_STATUS.VERIFIED,
              reviewedAt,
              reviewedByUserId: input.reviewerId,
            })
            .where(inArray(schema.verificationDocumentVersion.id, acceptedIds));
        }
      }

      await tx.insert(schema.verificationReviewEvent).values({
        applicationId: application.id,
        attempt: application.attempt,
        action: approved
          ? VERIFICATION_REVIEW_ACTION.APPROVED
          : VERIFICATION_REVIEW_ACTION.REJECTED,
        actorUserId: input.reviewerId,
        fromStatus: application.status,
        toStatus: nextStatus,
        note: input.rejection?.note,
        rejectedDocumentVersionIds: rejectedIds,
      });

      const [owner] = await tx
        .select({
          userId: schema.member.userId,
          email: schema.user.email,
        })
        .from(schema.member)
        .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
        .where(
          and(eq(schema.member.organizationId, application.organizationId), ownerRolePredicate()),
        )
        .orderBy(asc(schema.member.createdAt), asc(schema.member.id))
        .limit(1);
      if (!owner) throw new Error('Verification organization owner not found');
      await tx
        .insert(schema.verificationNotificationOutbox)
        .values({
          applicationId: application.id,
          attempt: application.attempt,
          eventType: approved
            ? VERIFICATION_NOTIFICATION_EVENT.APPROVED
            : VERIFICATION_NOTIFICATION_EVENT.CHANGES_REQUESTED,
          recipientUserId: owner.userId,
          recipientEmail: owner.email,
          note: input.rejection?.note,
        })
        .onConflictDoNothing();

      const profiles = await tx
        .select({ id: schema.designerProfile.id })
        .from(schema.designerProfile)
        .where(eq(schema.designerProfile.orgId, application.organizationId));
      if (profiles.length > 0) {
        await recordSearchProjectionEvents(
          tx,
          profiles.map((profile) => ({
            entityKind: 'designer',
            entityId: profile.id,
            operation: 'index',
            sourceUpdatedAt: reviewedAt,
          })),
        );
      }
      return updated;
    });
  },

  async revokeApproval(input: {
    applicationId: string;
    reviewerId: string;
    revocation: RevokeVerificationInput;
  }): Promise<VerificationApplicationRecord | VerificationMutationFailure> {
    return db.transaction(async (tx) => {
      const [application] = await tx
        .select()
        .from(schema.verificationApplication)
        .where(eq(schema.verificationApplication.id, input.applicationId))
        .for('update')
        .limit(1);
      if (!application) return VERIFICATION_MUTATION_RESULT.NOT_FOUND;
      if (application.status !== VERIFICATION_APPLICATION_STATUS.VERIFIED) {
        return VERIFICATION_MUTATION_RESULT.STATE_CHANGED;
      }

      const revokedAt = new Date();
      const nextAttempt = application.attempt + 1;
      const [updated] = await tx
        .update(schema.verificationApplication)
        .set({
          status: VERIFICATION_APPLICATION_STATUS.PENDING,
          attempt: nextAttempt,
          submittedAt: revokedAt,
          reviewedAt: null,
          reviewedByUserId: null,
          approvedAt: null,
          expiresAt: null,
          updatedAt: revokedAt,
        })
        .where(eq(schema.verificationApplication.id, application.id))
        .returning();
      if (!updated) throw new Error('Verification approval revocation failed');

      await tx.insert(schema.verificationReviewEvent).values({
        applicationId: application.id,
        attempt: nextAttempt,
        action: VERIFICATION_REVIEW_ACTION.APPROVAL_REVOKED,
        actorUserId: input.reviewerId,
        fromStatus: application.status,
        toStatus: VERIFICATION_APPLICATION_STATUS.PENDING,
        note: input.revocation.note,
        rejectedDocumentVersionIds: [],
      });

      const [owner] = await tx
        .select({
          userId: schema.member.userId,
          email: schema.user.email,
        })
        .from(schema.member)
        .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
        .where(
          and(eq(schema.member.organizationId, application.organizationId), ownerRolePredicate()),
        )
        .orderBy(asc(schema.member.createdAt), asc(schema.member.id))
        .limit(1);
      if (!owner) throw new Error('Verification organization owner not found');
      await tx.insert(schema.verificationNotificationOutbox).values({
        applicationId: application.id,
        attempt: nextAttempt,
        eventType: VERIFICATION_NOTIFICATION_EVENT.APPROVAL_REVOKED,
        recipientUserId: owner.userId,
        recipientEmail: owner.email,
        note: input.revocation.note,
      });

      const [profile] = await tx
        .select({ id: schema.designerProfile.id })
        .from(schema.designerProfile)
        .where(eq(schema.designerProfile.orgId, application.organizationId))
        .limit(1);
      if (profile) {
        await recordSearchProjectionEvents(tx, [
          {
            entityKind: 'designer',
            entityId: profile.id,
            operation: 'index',
            sourceUpdatedAt: revokedAt,
          },
        ]);
      }
      return updated;
    });
  },
};

export function hasBusinessDocument(documents: VerificationDocumentRecord[]): boolean {
  const businessTypes = new Set<VerificationDocumentType>(BUSINESS_VERIFICATION_DOCUMENT_TYPES);
  return documents.some(
    (document) =>
      businessTypes.has(document.type) &&
      (document.status === VERIFICATION_DOCUMENT_STATUS.UPLOADED ||
        document.status === VERIFICATION_DOCUMENT_STATUS.VERIFIED),
  );
}
