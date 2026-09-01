import { inArray } from 'drizzle-orm';
import { and, db, desc, eq, schema, sql } from '@repo/db';
import type { BookingStatus } from '@repo/contracts';

export type BookingRecord = typeof schema.consultationBooking.$inferSelect;
export type BookingSlotRecord = BookingRecord['preferredSlots'][number];

export type BookingViewRecord = BookingRecord & {
  organizationName: string;
  organizationSlug: string;
  requesterName: string;
  requesterEmail: string;
  requesterPhoneNumber: string | null;
  designerDisplayName: string;
  designerPortfolioSlug: string | null;
  referredProjectTitle: string | null;
  referredProjectSlug: string | null;
};

export type CreateBookingParams = {
  designerProfileId: string;
  requesterId: string;
  requesterName: string;
  requesterPhoneNumber: string;
  referredProjectId?: string | null;
  preferredSlots: BookingSlotRecord[];
  message?: string | null;
};

export type CreateBookingResult =
  | { kind: 'created'; booking: BookingViewRecord }
  | { kind: 'designer_not_found' }
  | { kind: 'designer_not_notifiable' }
  | { kind: 'invalid_project' }
  | { kind: 'open_limit_reached' };

export type ListBookingsParams = {
  requesterId?: string;
  organizationId?: string;
  status?: BookingStatus;
  limit: number;
  offset: number;
};

export type TransitionBookingParams = {
  id: string;
  expectedStatus: BookingStatus;
  toStatus: BookingStatus;
  confirmedSlot?: BookingSlotRecord;
  cancelledBy?: 'requester' | 'designer';
  cancelledByUserId?: string;
  cancelReason?: string | null;
};

function bookingProjection() {
  return {
    id: schema.consultationBooking.id,
    organizationId: schema.consultationBooking.organizationId,
    designerProfileId: schema.consultationBooking.designerProfileId,
    requesterId: schema.consultationBooking.requesterId,
    referredProjectId: schema.consultationBooking.referredProjectId,
    preferredSlots: schema.consultationBooking.preferredSlots,
    confirmedSlot: schema.consultationBooking.confirmedSlot,
    message: schema.consultationBooking.message,
    status: schema.consultationBooking.status,
    cancelledBy: schema.consultationBooking.cancelledBy,
    cancelledByUserId: schema.consultationBooking.cancelledByUserId,
    cancelReason: schema.consultationBooking.cancelReason,
    requestedAt: schema.consultationBooking.requestedAt,
    confirmedAt: schema.consultationBooking.confirmedAt,
    completedAt: schema.consultationBooking.completedAt,
    cancelledAt: schema.consultationBooking.cancelledAt,
    createdAt: schema.consultationBooking.createdAt,
    updatedAt: schema.consultationBooking.updatedAt,
    organizationName: schema.organization.name,
    organizationSlug: schema.designerProfile.slug,
    requesterName: schema.user.name,
    requesterEmail: schema.user.email,
    requesterPhoneNumber: schema.user.phoneNumber,
    designerDisplayName: schema.designerProfile.displayName,
    /** Designer-chosen slug when set; the org slug is resolved as the fallback in the service. */
    designerPortfolioSlug: schema.designerPortfolio.portfolioSlug,
    referredProjectTitle: schema.project.title,
    referredProjectSlug: schema.project.slug,
  };
}

function bookingViewQuery() {
  return db
    .select(bookingProjection())
    .from(schema.consultationBooking)
    .innerJoin(
      schema.designerProfile,
      eq(schema.consultationBooking.designerProfileId, schema.designerProfile.id),
    )
    .innerJoin(
      schema.organization,
      eq(schema.consultationBooking.organizationId, schema.organization.id),
    )
    .innerJoin(schema.user, eq(schema.consultationBooking.requesterId, schema.user.id))
    // Designers who never opened portfolio settings have no row; the org slug covers them.
    .leftJoin(
      schema.designerPortfolio,
      eq(schema.designerPortfolio.profileId, schema.designerProfile.id),
    )
    .leftJoin(
      schema.project,
      eq(schema.consultationBooking.referredProjectId, schema.project.id),
    );
}

export const bookingsRepository = {
  async findById(id: string): Promise<BookingViewRecord | null> {
    const [row] = await bookingViewQuery()
      .where(eq(schema.consultationBooking.id, id))
      .limit(1);
    return row ?? null;
  },

  async list(
    params: ListBookingsParams,
  ): Promise<{ items: BookingViewRecord[]; total: number }> {
    const filters = [
      params.requesterId
        ? eq(schema.consultationBooking.requesterId, params.requesterId)
        : undefined,
      params.organizationId
        ? eq(schema.consultationBooking.organizationId, params.organizationId)
        : undefined,
      params.status ? eq(schema.consultationBooking.status, params.status) : undefined,
    ].filter((filter) => filter !== undefined);
    const where = and(...filters);

    const [items, [count]] = await Promise.all([
      bookingViewQuery()
        .where(where)
        .orderBy(
          desc(schema.consultationBooking.requestedAt),
          desc(schema.consultationBooking.id),
        )
        .limit(params.limit)
        .offset(params.offset),
      db
        .select({ value: sql<number>`count(*)::int` })
        .from(schema.consultationBooking)
        .where(where),
    ]);

    return { items, total: count?.value ?? 0 };
  },

  async createWithLead(params: CreateBookingParams): Promise<CreateBookingResult> {
    const result = await db.transaction(async (tx) => {
      const [designer] = await tx
        .select({
          id: schema.designerProfile.id,
          organizationId: schema.designerProfile.orgId,
          teamId: schema.designerProfile.teamId,
          displayName: schema.designerProfile.displayName,
          phoneNumber: sql<string | null>`coalesce(
            nullif(btrim(${schema.designerProfile.phone}), ''),
            nullif(btrim(${schema.user.phoneNumber}), '')
          )`,
        })
        .from(schema.designerProfile)
        .leftJoin(schema.user, eq(schema.designerProfile.userId, schema.user.id))
        .where(
          and(
            eq(schema.designerProfile.id, params.designerProfileId),
            eq(schema.designerProfile.status, 'active'),
          ),
        )
        .limit(1);
      if (!designer) return { kind: 'designer_not_found' } as const;
      if (!designer.phoneNumber) return { kind: 'designer_not_notifiable' } as const;

      if (params.referredProjectId) {
        const [project] = await tx
          .select({ id: schema.project.id })
          .from(schema.project)
          .where(
            and(
              eq(schema.project.id, params.referredProjectId),
              eq(schema.project.designerId, designer.id),
              eq(schema.project.status, 'published'),
            ),
          )
          .limit(1);
        if (!project) return { kind: 'invalid_project' } as const;
      }

      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`${params.requesterId}:${params.designerProfileId}`}, 0))`,
      );

      const [openCount] = await tx
        .select({ value: sql<number>`count(*)::int` })
        .from(schema.consultationBooking)
        .where(
          and(
            eq(schema.consultationBooking.requesterId, params.requesterId),
            eq(schema.consultationBooking.designerProfileId, params.designerProfileId),
            inArray(schema.consultationBooking.status, ['requested', 'confirmed']),
          ),
        );
      if ((openCount?.value ?? 0) >= 3) return { kind: 'open_limit_reached' } as const;

      const [booking] = await tx
        .insert(schema.consultationBooking)
        .values({
          organizationId: designer.organizationId,
          designerProfileId: designer.id,
          requesterId: params.requesterId,
          referredProjectId: params.referredProjectId ?? null,
          preferredSlots: params.preferredSlots,
          message: params.message ?? null,
        })
        .returning({ id: schema.consultationBooking.id });
      if (!booking) throw new Error('booking insert returned no row');

      await tx.insert(schema.lead).values({
        organizationId: designer.organizationId,
        teamId: designer.teamId,
        referredProjectId: params.referredProjectId ?? null,
        name: params.requesterName,
        contactNumber: params.requesterPhoneNumber,
        message: params.message ?? null,
        source: 'consultation',
      });

      await tx.insert(schema.bookingNotificationOutbox).values({
        bookingId: booking.id,
        phoneNumber: designer.phoneNumber,
        requesterName: params.requesterName,
      });

      return {
        kind: 'created',
        bookingId: booking.id,
      } as const;
    });

    if (result.kind !== 'created') return result;

    const booking = await this.findById(result.bookingId);
    if (!booking) throw new Error('inserted booking not found');
    return { kind: 'created', booking };
  },

  async transition(params: TransitionBookingParams): Promise<BookingViewRecord | null> {
    return db.transaction(async (tx) => {
      const now = new Date();
      const [row] = await tx
        .update(schema.consultationBooking)
        .set({
          status: params.toStatus,
          confirmedSlot: params.confirmedSlot,
          confirmedAt: params.toStatus === 'confirmed' ? now : undefined,
          completedAt: params.toStatus === 'completed' ? now : undefined,
          cancelledAt: params.toStatus === 'cancelled' ? now : undefined,
          cancelledBy: params.cancelledBy,
          cancelledByUserId: params.cancelledByUserId,
          cancelReason: params.cancelReason,
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.consultationBooking.id, params.id),
            eq(schema.consultationBooking.status, params.expectedStatus),
          ),
        )
        .returning({ id: schema.consultationBooking.id });
      if (!row) return null;

      const [transitioned] = await tx
        .select(bookingProjection())
        .from(schema.consultationBooking)
        .innerJoin(
          schema.designerProfile,
          eq(schema.consultationBooking.designerProfileId, schema.designerProfile.id),
        )
        .innerJoin(
          schema.organization,
          eq(schema.consultationBooking.organizationId, schema.organization.id),
        )
        .innerJoin(schema.user, eq(schema.consultationBooking.requesterId, schema.user.id))
        .leftJoin(
          schema.designerPortfolio,
          eq(schema.designerPortfolio.profileId, schema.designerProfile.id),
        )
        .leftJoin(
          schema.project,
          eq(schema.consultationBooking.referredProjectId, schema.project.id),
        )
        .where(eq(schema.consultationBooking.id, row.id))
        .limit(1);
      if (!transitioned) throw new Error('transitioned booking not found');
      return transitioned;
    });
  },
};
