import { describe, expect, it, vi } from 'vitest';
import { bookingResponseSchema, listBookingsResponseSchema } from '@repo/contracts';
import { and, db, eq, schema, sql } from '@repo/db';
import { makeConsultationBooking, makeDesigner, makeProject, makeTeam } from '@repo/db/testing';
import { app } from '../../../src/app.js';
import { bookingsRepository } from '../../../src/modules/bookings/repository.js';
import {
  activateOrganization,
  createRoleSession,
  mergeResponseCookies,
} from '../../helpers/auth.js';

vi.mock('@repo/queue', () => ({
  enqueueSms: vi.fn(async () => {}),
  enqueueBookingNotification: vi.fn(async () => {}),
}));

/**
 * `requestedSlotsSchema` rejects any slot before today, resolved in IST, so these
 * dates must be derived rather than hardcoded — a literal turns the POST tests into
 * a 422 the moment IST rolls past it. Resolved in IST to match the schema, and
 * offset from tomorrow rather than today so a run crossing IST midnight can't
 * strand the earliest slot in the past.
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const istDay = (daysFromNow: number): string =>
  new Date(Date.now() + IST_OFFSET_MS + daysFromNow * 86_400_000).toISOString().slice(0, 10);

const slot = { date: istDay(1), window: 'morning' } as const;
const secondSlot = { date: istDay(2), window: 'afternoon' } as const;

describe('consultation participant boundaries', () => {
  it('uses database time when the application clock trails the stored request timestamp', async () => {
    const { designer, cookie } = await makeDesignerSession('+919800009109');
    const booking = await makeConsultationBooking({
      designerProfileId: designer.id,
      preferredSlots: [slot],
    });
    const future = new Date(Date.now() + 60_000);
    await db
      .update(schema.consultationBooking)
      .set({ createdAt: future, requestedAt: future, updatedAt: future })
      .where(eq(schema.consultationBooking.id, booking.id));
    const response = await requestJson(
      `/api/bookings/${booking.id}/confirm?expectedStatus=requested`,
      'POST',
      cookie,
      { confirmedSlot: slot },
    );
    expect(response.status).toBe(200);
    const body = bookingResponseSchema.parse(await response.json());
    expect(body.confirmedAt).not.toBeNull();
    expect(Date.parse(body.confirmedAt ?? '')).toBeGreaterThanOrEqual(future.getTime());
  });
  it('rejects stale cancellation without changing a confirmed consultation', async () => {
    const { designer, cookie: ownerCookie } = await makeDesignerSession('+919800009101');
    const { cookie, userId } = await createRoleSession('+919800009102', 'visitor');
    const booking = await makeConsultationBooking({
      designerProfileId: designer.id,
      requesterId: userId,
      preferredSlots: [slot],
    });
    const confirmed = await requestJson(
      `/api/bookings/${booking.id}/confirm?expectedStatus=requested`,
      'POST',
      ownerCookie,
      { confirmedSlot: slot },
    );
    expect(confirmed.status).toBe(200);
    const stale = await requestJson(
      `/api/bookings/${booking.id}/cancel?expectedStatus=requested`,
      'POST',
      cookie,
      { reason: 'My plans changed' },
    );
    expect(stale.status).toBe(409);
    const invalid = await requestJson(
      `/api/bookings/${booking.id}/cancel?expectedStatus=made-up`,
      'POST',
      cookie,
      { reason: 'My plans changed' },
    );
    expect(invalid.status).toBe(422);
    expect((await bookingsRepository.findById(booking.id))?.status).toBe('confirmed');
    expect(
      (
        await requestJson(
          `/api/bookings/${booking.id}/cancel?expectedStatus=confirmed`,
          'POST',
          cookie,
          { reason: 'My plans changed' },
        )
      ).status,
    ).toBe(200);
  });
  it('keeps requester contacts private and rejects platform/admin and organization-context personal reads', async () => {
    const { designer, cookie: ownerCookie } = await makeDesignerSession('+919800009103');
    const { cookie, userId } = await createRoleSession('+919800009104', 'visitor');
    await makeConsultationBooking({
      designerProfileId: designer.id,
      requesterId: userId,
      preferredSlots: [slot],
    });
    const mine = await requestJson('/api/bookings/mine', 'GET', cookie);
    expect(mine.status).toBe(200);
    expect(mine.headers.get('cache-control')).toBe('private, no-store');
    const stranger = await createRoleSession('+919800009105', 'visitor');
    const strangerMine = await requestJson('/api/bookings/mine', 'GET', stranger.cookie);
    expect(listBookingsResponseSchema.parse(await strangerMine.json()).items).toHaveLength(0);
    expect((await requestJson('/api/bookings/mine', 'GET', ownerCookie)).status).toBe(403);
    const admin = await createRoleSession('+919800009106', 'admin');
    expect((await requestJson('/api/bookings/mine', 'GET', admin.cookie)).status).toBe(403);
    await db.update(schema.user).set({ status: 'deleted' }).where(eq(schema.user.id, userId));
    expect((await requestJson('/api/bookings/mine', 'GET', cookie)).status).toBe(403);
  });

  it('repairs a stale branch session before exposing requester contact details', async () => {
    const designerSession = await makeDesignerSession('+919800009110');
    const requesterSession = await createRoleSession('+919800009111', 'visitor');
    await makeConsultationBooking({
      organizationId: designerSession.designer.orgId,
      designerProfileId: designerSession.designer.id,
      requesterId: requesterSession.userId,
      preferredSlots: [slot],
    });
    await db
      .delete(schema.teamMember)
      .where(
        and(
          eq(schema.teamMember.teamId, designerSession.designer.teamId),
          eq(schema.teamMember.userId, designerSession.userId),
        ),
      );

    const response = await app.request('/api/bookings', {
      headers: { cookie: designerSession.cookie },
    });

    expect(response.status).toBe(422);
    expect(JSON.stringify(await response.json())).not.toContain(requesterSession.userId);
  });
  it('blocks studio members booking themselves even from personal context', async () => {
    const { cookie, userId } = await createRoleSession('+919800009107', 'designer');
    const designer = await makeDesigner({ userId, status: 'active', phone: '+919800009108' });
    const response = await requestJson('/api/bookings', 'POST', cookie, {
      designerProfileId: designer.id,
      preferredSlots: [slot],
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { message: expect.stringContaining('own studio') },
    });
  });
});

async function makeDesignerSession(phoneNumber: string) {
  const { cookie, userId } = await createRoleSession(phoneNumber, 'designer');
  const designer = await makeDesigner({
    userId,
    status: 'active',
    displayName: 'North Star Studio',
    phone: '+919800009999',
  });
  await db.insert(schema.member).values({
    id: `booking-member-${userId}`,
    organizationId: designer.orgId,
    userId,
    role: 'owner',
    createdAt: new Date(),
  });
  return {
    cookie: await activateOrganization(cookie, designer.orgId),
    userId,
    designer,
  };
}

async function requestJson(
  path: string,
  method: string,
  cookie: string | undefined,
  body?: unknown,
) {
  return app.request(path, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function activateTeam(cookie: string, teamId: string): Promise<string> {
  const response = await requestJson('/api/auth/organization/set-active-team', 'POST', cookie, {
    teamId,
  });
  if (!response.ok) {
    throw new Error(`activateTeam: Better Auth returned ${response.status}`);
  }
  return mergeResponseCookies(cookie, response);
}

describe('POST /api/bookings', () => {
  it('requires authentication and validates unique preferred slots', async () => {
    const designer = await makeDesigner({ status: 'active' });

    const unauthenticated = await requestJson('/api/bookings', 'POST', undefined, {
      designerProfileId: designer.id,
      preferredSlots: [slot],
    });
    expect(unauthenticated.status).toBe(401);

    const { cookie } = await createRoleSession('+919800004001', 'visitor');
    const duplicateSlots = await requestJson('/api/bookings', 'POST', cookie, {
      designerProfileId: designer.id,
      preferredSlots: [slot, slot],
    });
    expect(duplicateSlots.status).toBe(422);
  });

  it('creates a requested booking and consultation lead atomically', async () => {
    const { designer } = await makeDesignerSession('+919800004002');
    const project = await makeProject({
      designerId: designer.id,
      status: 'published',
      title: 'Sunlit Bandra Apartment',
    });
    const { cookie, userId } = await createRoleSession('+919800004102', 'visitor');

    const response = await requestJson('/api/bookings', 'POST', cookie, {
      designerProfileId: designer.id,
      referredProjectId: project.id,
      preferredSlots: [slot, secondSlot],
      message: 'I would like to discuss my renovation.',
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({
      status: 'requested',
      organization: { id: designer.orgId },
      designerProfile: { id: designer.id, displayName: 'North Star Studio' },
      requester: { id: userId, phoneNumber: '+919800004102' },
      referredProject: { id: project.id, title: 'Sunlit Bandra Apartment' },
      preferredSlots: [slot, secondSlot],
      reviewEligible: false,
    });

    const [booking] = await db
      .select()
      .from(schema.consultationBooking)
      .where(eq(schema.consultationBooking.requesterId, userId));
    expect(booking).toMatchObject({
      designerProfileId: designer.id,
      referredProjectId: project.id,
      status: 'requested',
    });

    const [lead] = await db
      .select()
      .from(schema.lead)
      .where(
        and(eq(schema.lead.organizationId, designer.orgId), eq(schema.lead.source, 'consultation')),
      );
    expect(lead).toMatchObject({
      referredProjectId: project.id,
      contactNumber: '+919800004102',
      message: 'I would like to discuss my renovation.',
    });

    const [notification] = await db
      .select()
      .from(schema.bookingNotificationOutbox)
      .where(eq(schema.bookingNotificationOutbox.bookingId, booking!.id));
    expect(notification).toMatchObject({
      phoneNumber: '+919800009999',
      requesterName: expect.any(String),
      enqueuedAt: null,
    });
  });

  it('rejects project references that do not belong to the selected designer', async () => {
    const designer = await makeDesigner({ status: 'active', phone: '+919800009998' });
    const otherProject = await makeProject({ status: 'published' });
    const { cookie, userId } = await createRoleSession('+919800004107', 'visitor');

    const response = await requestJson('/api/bookings', 'POST', cookie, {
      designerProfileId: designer.id,
      referredProjectId: otherProject.id,
      preferredSlots: [slot],
    });

    expect(response.status).toBe(422);
    const [bookingCount] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(schema.consultationBooking)
      .where(eq(schema.consultationBooking.requesterId, userId));
    expect(bookingCount?.value).toBe(0);
  });

  it('enforces the three-open-booking cap under concurrent requests', async () => {
    const designer = await makeDesigner({ status: 'active', phone: '+919800009997' });
    const { cookie, userId } = await createRoleSession('+919800004103', 'visitor');
    for (let index = 0; index < 2; index += 1) {
      await makeConsultationBooking({
        designerProfileId: designer.id,
        organizationId: designer.orgId,
        requesterId: userId,
        preferredSlots: [{ date: istDay(1 + index), window: 'morning' }],
      });
    }

    const responses = await Promise.all([
      requestJson('/api/bookings', 'POST', cookie, {
        designerProfileId: designer.id,
        preferredSlots: [secondSlot],
      }),
      requestJson('/api/bookings', 'POST', cookie, {
        designerProfileId: designer.id,
        preferredSlots: [{ date: istDay(3), window: 'evening' }],
      }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const [count] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(schema.consultationBooking)
      .where(
        and(
          eq(schema.consultationBooking.requesterId, userId),
          eq(schema.consultationBooking.designerProfileId, designer.id),
        ),
      );
    expect(count?.value).toBe(3);
  });

  it('rejects a designer without an SMS destination before creating records', async () => {
    const designer = await makeDesigner({ status: 'active', phone: null });
    const { cookie, userId } = await createRoleSession('+919800004110', 'visitor');

    const response = await requestJson('/api/bookings', 'POST', cookie, {
      designerProfileId: designer.id,
      preferredSlots: [slot],
    });

    expect(response.status).toBe(422);
    const [bookingCount] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(schema.consultationBooking)
      .where(eq(schema.consultationBooking.requesterId, userId));
    expect(bookingCount?.value).toBe(0);
  });

  it('rolls back the booking when consultation lead creation fails', async () => {
    const designer = await makeDesigner({ status: 'active', phone: '+919800009996' });
    const { cookie, userId } = await createRoleSession('+919800004111', 'visitor');
    await db.execute(
      sql.raw(`
      CREATE FUNCTION fail_consultation_lead_insert() RETURNS trigger AS $$
      BEGIN
        IF NEW.source = 'consultation' THEN
          RAISE EXCEPTION 'forced consultation lead failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `),
    );
    await db.execute(
      sql.raw(`
      CREATE TRIGGER fail_consultation_lead_insert
      BEFORE INSERT ON lead
      FOR EACH ROW EXECUTE FUNCTION fail_consultation_lead_insert()
    `),
    );

    try {
      const response = await requestJson('/api/bookings', 'POST', cookie, {
        designerProfileId: designer.id,
        preferredSlots: [slot],
      });
      expect(response.status).toBe(500);
    } finally {
      await db.execute(sql.raw('DROP TRIGGER fail_consultation_lead_insert ON lead'));
      await db.execute(sql.raw('DROP FUNCTION fail_consultation_lead_insert()'));
    }

    const [bookingCount] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(schema.consultationBooking)
      .where(eq(schema.consultationBooking.requesterId, userId));
    const [notificationCount] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(schema.bookingNotificationOutbox);
    expect(bookingCount?.value).toBe(0);
    expect(notificationCount?.value).toBe(0);
  });
});

describe('booking lists and transitions', () => {
  it('enforces lifecycle invariants at the database boundary', async () => {
    const booking = await makeConsultationBooking({ preferredSlots: [slot] });

    await expect(
      db
        .update(schema.consultationBooking)
        .set({
          status: 'confirmed',
          confirmedSlot: secondSlot,
          confirmedAt: new Date(),
        })
        .where(eq(schema.consultationBooking.id, booking.id)),
    ).rejects.toThrow();

    await expect(
      db
        .update(schema.consultationBooking)
        .set({
          status: 'cancelled',
          cancelledBy: 'designer',
          cancelledByUserId: booking.requesterId,
          cancelReason: '   ',
          cancelledAt: new Date(),
        })
        .where(eq(schema.consultationBooking.id, booking.id)),
    ).rejects.toThrow();
  });

  it('supports requester and designer lists, confirmation, completion, and review eligibility', async () => {
    const designerSession = await makeDesignerSession('+919800004003');
    const requesterSession = await createRoleSession('+919800004104', 'visitor');
    const booking = await makeConsultationBooking({
      organizationId: designerSession.designer.orgId,
      designerProfileId: designerSession.designer.id,
      requesterId: requesterSession.userId,
      preferredSlots: [slot, secondSlot],
    });

    const mine = await app.request('/api/bookings/mine?status=requested', {
      headers: { cookie: requesterSession.cookie },
    });
    expect(mine.status).toBe(200);
    expect(await mine.json()).toMatchObject({ total: 1, items: [{ id: booking.id }] });

    const inbox = await app.request('/api/bookings?status=requested', {
      headers: { cookie: designerSession.cookie },
    });
    expect(inbox.status).toBe(200);
    expect(await inbox.json()).toMatchObject({ total: 1, items: [{ id: booking.id }] });

    const confirm = await requestJson(
      `/api/bookings/${booking.id}/confirm`,
      'POST',
      designerSession.cookie,
      { confirmedSlot: secondSlot },
    );
    expect(confirm.status).toBe(200);
    expect(await confirm.json()).toMatchObject({
      status: 'confirmed',
      confirmedSlot: secondSlot,
      reviewEligible: false,
    });

    const complete = await requestJson(
      `/api/bookings/${booking.id}/complete`,
      'POST',
      designerSession.cookie,
    );
    expect(complete.status).toBe(200);
    expect(await complete.json()).toMatchObject({
      status: 'completed',
      reviewEligible: true,
    });

    const terminalCancel = await requestJson(
      `/api/bookings/${booking.id}/cancel`,
      'POST',
      requesterSession.cookie,
      {},
    );
    expect(terminalCancel.status).toBe(409);
  });

  it('scopes the designer inbox and confirmation to the active branch', async () => {
    const designerSession = await makeDesignerSession('+919800004014');
    const secondTeam = await makeTeam({
      organizationId: designerSession.designer.orgId,
      name: 'Pune',
    });
    const secondDesigner = await makeDesigner({
      orgId: designerSession.designer.orgId,
      teamId: secondTeam.id,
      userId: designerSession.userId,
      status: 'active',
      displayName: 'North Star Studio Pune',
      phone: '+919800009998',
    });
    const requesterSession = await createRoleSession('+919800004114', 'visitor');
    const firstBooking = await makeConsultationBooking({
      organizationId: designerSession.designer.orgId,
      designerProfileId: designerSession.designer.id,
      requesterId: requesterSession.userId,
      preferredSlots: [slot],
    });
    const secondBooking = await makeConsultationBooking({
      organizationId: designerSession.designer.orgId,
      designerProfileId: secondDesigner.id,
      requesterId: requesterSession.userId,
      preferredSlots: [slot],
    });
    const firstBranchCookie = await activateTeam(
      designerSession.cookie,
      designerSession.designer.teamId,
    );

    const inbox = await app.request('/api/bookings?status=requested', {
      headers: { cookie: firstBranchCookie },
    });
    expect(inbox.status).toBe(200);
    expect(await inbox.json()).toMatchObject({
      total: 1,
      items: [{ id: firstBooking.id }],
    });

    const hiddenConfirmation = await requestJson(
      `/api/bookings/${secondBooking.id}/confirm`,
      'POST',
      firstBranchCookie,
      { confirmedSlot: slot },
    );
    expect(hiddenConfirmation.status).toBe(404);

    const secondBranchCookie = await activateTeam(firstBranchCookie, secondTeam.id);
    const confirmation = await requestJson(
      `/api/bookings/${secondBooking.id}/confirm`,
      'POST',
      secondBranchCookie,
      { confirmedSlot: slot },
    );
    expect(confirmation.status).toBe(200);
    expect(await confirmation.json()).toMatchObject({
      id: secondBooking.id,
      status: 'confirmed',
    });
  });

  it('allows only one compare-and-swap transition to win', async () => {
    const designerSession = await makeDesignerSession('+919800004012');
    const requesterSession = await createRoleSession('+919800004112', 'visitor');
    const booking = await makeConsultationBooking({
      organizationId: designerSession.designer.orgId,
      designerProfileId: designerSession.designer.id,
      requesterId: requesterSession.userId,
      preferredSlots: [slot],
    });

    const results = await Promise.all([
      bookingsRepository.transition({
        id: booking.id,
        expectedStatus: 'requested',
        toStatus: 'confirmed',
        confirmedSlot: slot,
      }),
      bookingsRepository.transition({
        id: booking.id,
        expectedStatus: 'requested',
        toStatus: 'confirmed',
        confirmedSlot: slot,
      }),
    ]);

    expect(results.filter((result) => result !== null)).toHaveLength(1);
    expect(results.filter((result) => result === null)).toHaveLength(1);
  });

  it('requires an exact proposed confirmation slot and a designer cancellation reason', async () => {
    const designerSession = await makeDesignerSession('+919800004004');
    const requesterSession = await createRoleSession('+919800004105', 'visitor');
    const booking = await makeConsultationBooking({
      organizationId: designerSession.designer.orgId,
      designerProfileId: designerSession.designer.id,
      requesterId: requesterSession.userId,
      preferredSlots: [slot],
    });

    const invalidSlot = await requestJson(
      `/api/bookings/${booking.id}/confirm`,
      'POST',
      designerSession.cookie,
      { confirmedSlot: secondSlot },
    );
    expect(invalidSlot.status).toBe(422);

    const missingReason = await requestJson(
      `/api/bookings/${booking.id}/cancel`,
      'POST',
      designerSession.cookie,
      {},
    );
    expect(missingReason.status).toBe(422);

    const cancelled = await requestJson(
      `/api/bookings/${booking.id}/cancel`,
      'POST',
      designerSession.cookie,
      { reason: 'The studio is unavailable that week.' },
    );
    expect(cancelled.status).toBe(200);
    expect(await cancelled.json()).toMatchObject({
      status: 'cancelled',
      cancelledBy: 'designer',
      cancelledByUserId: designerSession.userId,
      cancelReason: 'The studio is unavailable that week.',
    });
  });

  it('cancels a confirmed booking without discarding its selected slot', async () => {
    const designerSession = await makeDesignerSession('+919800004013');
    const requesterSession = await createRoleSession('+919800004113', 'visitor');
    const confirmedAt = new Date();
    const booking = await makeConsultationBooking({
      organizationId: designerSession.designer.orgId,
      designerProfileId: designerSession.designer.id,
      requesterId: requesterSession.userId,
      preferredSlots: [slot],
      confirmedSlot: slot,
      status: 'confirmed',
      requestedAt: new Date(confirmedAt.getTime() - 1_000),
      confirmedAt,
    });

    const cancelled = await requestJson(
      `/api/bookings/${booking.id}/cancel`,
      'POST',
      requesterSession.cookie,
      {},
    );

    expect(cancelled.status).toBe(200);
    expect(await cancelled.json()).toMatchObject({
      status: 'cancelled',
      confirmedSlot: slot,
      confirmedAt: confirmedAt.toISOString(),
      cancelledBy: 'requester',
    });
  });

  it('lets the requester cancel but hides bookings from unrelated organizations', async () => {
    const designerSession = await makeDesignerSession('+919800004005');
    const otherDesignerSession = await makeDesignerSession('+919800004006');
    const requesterSession = await createRoleSession('+919800004106', 'visitor');
    const booking = await makeConsultationBooking({
      organizationId: designerSession.designer.orgId,
      designerProfileId: designerSession.designer.id,
      requesterId: requesterSession.userId,
    });

    const crossOrganization = await requestJson(
      `/api/bookings/${booking.id}/complete`,
      'POST',
      otherDesignerSession.cookie,
    );
    expect(crossOrganization.status).toBe(404);

    const cancelled = await requestJson(
      `/api/bookings/${booking.id}/cancel`,
      'POST',
      requesterSession.cookie,
      {},
    );
    expect(cancelled.status).toBe(200);
    expect(await cancelled.json()).toMatchObject({
      status: 'cancelled',
      cancelledBy: 'requester',
      cancelledByUserId: requesterSession.userId,
    });

    const completedAt = new Date();
    const terminalBooking = await makeConsultationBooking({
      organizationId: designerSession.designer.orgId,
      designerProfileId: designerSession.designer.id,
      requesterId: requesterSession.userId,
      preferredSlots: [slot],
      confirmedSlot: slot,
      status: 'completed',
      requestedAt: new Date(completedAt.getTime() - 1_000),
      confirmedAt: completedAt,
      completedAt,
    });
    const hiddenTerminal = await requestJson(
      `/api/bookings/${terminalBooking.id}/cancel`,
      'POST',
      otherDesignerSession.cookie,
      {},
    );
    expect(hiddenTerminal.status).toBe(404);
  });

  it('lets read-only members view the inbox but not mutate bookings', async () => {
    const designerSession = await makeDesignerSession('+919800004007');
    const requesterSession = await createRoleSession('+919800004108', 'visitor');
    const readOnlySession = await createRoleSession('+919800004109', 'designer');
    await db.insert(schema.member).values({
      id: `booking-readonly-${readOnlySession.userId}`,
      organizationId: designerSession.designer.orgId,
      userId: readOnlySession.userId,
      role: 'member',
      createdAt: new Date(),
    });
    await db.insert(schema.teamMember).values({
      id: `booking-readonly-team-${readOnlySession.userId}`,
      teamId: designerSession.designer.teamId,
      userId: readOnlySession.userId,
      createdAt: new Date(),
    });
    const readOnlyCookie = await activateOrganization(
      readOnlySession.cookie,
      designerSession.designer.orgId,
    );
    const booking = await makeConsultationBooking({
      organizationId: designerSession.designer.orgId,
      designerProfileId: designerSession.designer.id,
      requesterId: requesterSession.userId,
      preferredSlots: [slot],
    });

    const inbox = await app.request('/api/bookings', {
      headers: { cookie: readOnlyCookie },
    });
    expect(inbox.status).toBe(200);

    const confirm = await requestJson(
      `/api/bookings/${booking.id}/confirm`,
      'POST',
      readOnlyCookie,
      { confirmedSlot: slot },
    );
    expect(confirm.status).toBe(403);
  });
});
