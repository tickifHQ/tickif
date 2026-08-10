import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@repo/db';
import {
  makeConsultationBooking,
  makeDesigner,
  makeOrganization,
  makeProject,
  makeUser,
} from '@repo/db/testing';
import { reviewsService } from '../../../src/modules/reviews/service.js';
import { reviewsRepository } from '../../../src/modules/reviews/repository.js';

let fixtureSequence = 0;

async function makeReviewFixture() {
  fixtureSequence += 1;
  const suffix = String(fixtureSequence).padStart(3, '0');
  const owner = await makeUser({
    name: 'Designer Owner',
    phoneNumber: `+919800005${suffix}`,
    phoneNumberVerified: true,
  });
  const organization = await makeOrganization();
  const designer = await makeDesigner({
    userId: owner.id,
    orgId: organization.id,
    status: 'active',
  });
  await db.insert(schema.member).values({
    id: `member-${owner.id}`,
    organizationId: organization.id,
    userId: owner.id,
    role: 'owner',
    createdAt: new Date(),
  });
  const author = await makeUser({
    name: 'Review Author',
    phoneNumber: `+919800006${suffix}`,
    phoneNumberVerified: true,
  });
  const admin = await makeUser({ name: 'Review Admin' });
  return { owner, organization, designer, author, admin };
}

describe('review lifecycle', () => {
  it('publishes, recomputes the designer aggregate, and removes it on author edit', async () => {
    const { designer, author, admin } = await makeReviewFixture();
    const created = await reviewsService.create(
      {
        designerProfileId: designer.id,
        rating: 5,
        body: 'The team communicated clearly and delivered a thoughtful home.',
      },
      {
        userId: author.id,
        phoneNumberVerified: true,
        activeOrgId: null,
      },
    );
    expect(created.status).toBe('pending');

    const published = await reviewsService.publish(created.id, { userId: admin.id });
    expect(published.status).toBe('published');
    expect(published.publishedAt).not.toBeNull();

    const [profileAfterPublish] = await db
      .select()
      .from(schema.designerProfile)
      .where(eq(schema.designerProfile.id, designer.id));
    expect(Number(profileAfterPublish?.avgRating)).toBe(5);
    expect(profileAfterPublish?.reviewCount).toBe(1);

    const publicPage = await reviewsService.listPublished({
      designerProfileId: designer.id,
      page: 1,
      limit: 20,
    });
    expect(publicPage).toMatchObject({
      averageRating: 5,
      reviewCount: 1,
      histogram: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 },
    });

    const edited = await reviewsService.update(
      created.id,
      { rating: 4 },
      {
        userId: author.id,
        phoneNumberVerified: true,
        activeOrgId: null,
      },
    );
    expect(edited).toMatchObject({
      status: 'pending',
      rating: 4,
      publishedAt: null,
    });

    const [profileAfterEdit, events, projectionEvents] = await Promise.all([
      db
        .select()
        .from(schema.designerProfile)
        .where(eq(schema.designerProfile.id, designer.id))
        .then((rows) => rows[0]),
      db
        .select()
        .from(schema.reviewModerationEvent)
        .where(eq(schema.reviewModerationEvent.reviewId, created.id))
        .orderBy(schema.reviewModerationEvent.createdAt),
      db
        .select()
        .from(schema.searchProjectionOutbox)
        .where(eq(schema.searchProjectionOutbox.entityId, designer.id))
        .orderBy(schema.searchProjectionOutbox.sequence),
    ]);
    expect(Number(profileAfterEdit?.avgRating)).toBe(0);
    expect(profileAfterEdit?.reviewCount).toBe(0);
    expect(events.map((event) => event.action)).toEqual(['submit', 'publish', 'edit']);
    expect(projectionEvents).toHaveLength(2);
    expect(projectionEvents.every((event) => event.entityKind === 'designer')).toBe(true);
  });

  it('removes a disputed review from aggregates and restores it when an admin republishes it', async () => {
    const { owner, organization, designer, author, admin } = await makeReviewFixture();
    const review = await reviewsService.create(
      {
        designerProfileId: designer.id,
        rating: 3,
        body: 'The result was good, though the final handover needed more coordination.',
      },
      {
        userId: author.id,
        phoneNumberVerified: true,
        activeOrgId: null,
      },
    );
    await reviewsService.publish(review.id, { userId: admin.id });

    const disputed = await reviewsService.dispute(
      review.id,
      { note: 'This review contains a disputed account of the handover.' },
      {
        userId: owner.id,
        phoneNumberVerified: true,
        activeOrgId: organization.id,
      },
    );
    expect(disputed.status).toBe('disputed');

    const [afterDispute] = await db
      .select()
      .from(schema.designerProfile)
      .where(eq(schema.designerProfile.id, designer.id));
    expect(afterDispute?.reviewCount).toBe(0);

    const resolved = await reviewsService.resolveDispute(
      review.id,
      {
        decision: 'publish',
        note: 'The review is within policy and can be restored.',
      },
      { userId: admin.id },
    );
    expect(resolved.status).toBe('published');

    const [afterResolve] = await db
      .select()
      .from(schema.designerProfile)
      .where(eq(schema.designerProfile.id, designer.id));
    expect(Number(afterResolve?.avgRating)).toBe(3);
    expect(afterResolve?.reviewCount).toBe(1);
  });

  it('rechecks organization write access when a designer disputes a review', async () => {
    const { organization, designer, author, admin } = await makeReviewFixture();
    const writer = await makeUser({ name: 'Designer Admin' });
    const membershipId = `member-${writer.id}`;
    await db.insert(schema.member).values({
      id: membershipId,
      organizationId: organization.id,
      userId: writer.id,
      role: 'admin',
      createdAt: new Date(),
    });
    const review = await reviewsService.create(
      {
        designerProfileId: designer.id,
        rating: 3,
        body: 'The project result was good, but the final handover needed more coordination.',
      },
      {
        userId: author.id,
        phoneNumberVerified: true,
        activeOrgId: null,
      },
    );
    await reviewsService.publish(review.id, { userId: admin.id });
    await db.delete(schema.member).where(eq(schema.member.id, membershipId));

    await expect(
      reviewsService.dispute(
        review.id,
        { note: 'This dispute should fail because writer access was revoked.' },
        {
          userId: writer.id,
          phoneNumberVerified: true,
          activeOrgId: organization.id,
        },
      ),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('marks only a completed matching consultation as verified', async () => {
    const { designer, author } = await makeReviewFixture();
    const project = await makeProject({ designerId: designer.id, status: 'published' });
    // Derive the lifecycle timestamps from the current time: requestedAt defaults to now(),
    // and consultation_booking_timestamp_order_check requires requestedAt <= confirmedAt <= completedAt.
    const requestedAt = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const confirmedAt = new Date(requestedAt.getTime() + 60 * 60 * 1000);
    const completedAt = new Date(confirmedAt.getTime() + 60 * 60 * 1000);
    const booking = await makeConsultationBooking({
      designerProfileId: designer.id,
      organizationId: designer.orgId,
      requesterId: author.id,
      referredProjectId: project.id,
      status: 'completed',
      confirmedSlot: { date: confirmedAt.toISOString().slice(0, 10), window: 'morning' },
      requestedAt,
      confirmedAt,
      completedAt,
    });

    const review = await reviewsService.create(
      {
        designerProfileId: designer.id,
        projectId: project.id,
        bookingId: booking.id,
        rating: 5,
        body: 'The consultation gave us clear priorities and a practical design direction.',
      },
      {
        userId: author.id,
        phoneNumberVerified: true,
        activeOrgId: null,
      },
    );
    expect(review).toMatchObject({
      project: { id: project.id },
      bookingId: booking.id,
      verifiedConsultation: true,
    });
  });

  it('blocks unverified authors and members of the designer organization', async () => {
    const { owner, organization, designer } = await makeReviewFixture();

    await expect(
      reviewsService.create(
        {
          designerProfileId: designer.id,
          rating: 5,
          body: 'This review should not be accepted without a verified phone number.',
        },
        {
          userId: owner.id,
          phoneNumberVerified: false,
          activeOrgId: organization.id,
        },
      ),
    ).rejects.toMatchObject({ code: 'validation_error' });

    await expect(
      reviewsService.create(
        {
          designerProfileId: designer.id,
          rating: 5,
          body: 'This review should not be accepted from the designer organization.',
        },
        {
          userId: owner.id,
          phoneNumberVerified: true,
          activeOrgId: organization.id,
        },
      ),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('allows only one concurrent publish transition', async () => {
    const { designer, author, admin } = await makeReviewFixture();
    const review = await reviewsService.create(
      {
        designerProfileId: designer.id,
        rating: 4,
        body: 'The project was completed carefully and communication stayed consistent.',
      },
      {
        userId: author.id,
        phoneNumberVerified: true,
        activeOrgId: null,
      },
    );

    const results = await Promise.allSettled([
      reviewsService.publish(review.id, { userId: admin.id }),
      reviewsService.publish(review.id, { userId: admin.id }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);

    const [profile] = await db
      .select()
      .from(schema.designerProfile)
      .where(eq(schema.designerProfile.id, designer.id));
    expect(profile?.reviewCount).toBe(1);
  });

  it('enforces the 24-hour edit window for published reviews', async () => {
    const { designer, author, admin } = await makeReviewFixture();
    const review = await reviewsService.create(
      {
        designerProfileId: designer.id,
        rating: 4,
        body: 'The design was practical, polished, and handled with consistent updates.',
      },
      {
        userId: author.id,
        phoneNumberVerified: true,
        activeOrgId: null,
      },
    );
    await reviewsService.publish(review.id, { userId: admin.id });
    const createdAt = new Date(Date.now() - 26 * 60 * 60 * 1000);
    const publishedAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await db
      .update(schema.review)
      .set({
        createdAt,
        publishedAt,
        moderatedAt: publishedAt,
      })
      .where(eq(schema.review.id, review.id));

    await expect(
      reviewsService.update(
        review.id,
        { rating: 3 },
        {
          userId: author.id,
          phoneNumberVerified: true,
          activeOrgId: null,
        },
      ),
    ).rejects.toMatchObject({
      code: 'conflict',
      message: 'Published reviews can only be edited within 24 hours',
    });
  });

  it('enforces the published edit cutoff inside the update transaction', async () => {
    const { designer, author, admin } = await makeReviewFixture();
    const review = await reviewsService.create(
      {
        designerProfileId: designer.id,
        rating: 4,
        body: 'The design process was detailed, collaborative, and professionally managed.',
      },
      {
        userId: author.id,
        phoneNumberVerified: true,
        activeOrgId: null,
      },
    );
    const published = await reviewsService.publish(review.id, { userId: admin.id });
    const createdAt = new Date(Date.now() - 26 * 60 * 60 * 1000);
    const publishedAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await db
      .update(schema.review)
      .set({
        createdAt,
        publishedAt,
        moderatedAt: publishedAt,
      })
      .where(eq(schema.review.id, published.id));

    const result = await reviewsRepository.update({
      id: published.id,
      authorUserId: author.id,
      designerProfileId: designer.id,
      fromStatus: 'published',
      expectedRevision: published.moderationRevision,
      rating: 3,
    });
    expect(result.kind).toBe('conflict');
  });

  it('rechecks phone verification and self-review eligibility on author edits', async () => {
    const first = await makeReviewFixture();
    const phoneReview = await reviewsService.create(
      {
        designerProfileId: first.designer.id,
        rating: 5,
        body: 'The original review is valid before phone verification is revoked.',
      },
      {
        userId: first.author.id,
        phoneNumberVerified: true,
        activeOrgId: null,
      },
    );
    await db
      .update(schema.user)
      .set({ phoneNumberVerified: false })
      .where(eq(schema.user.id, first.author.id));

    await expect(
      reviewsService.update(
        phoneReview.id,
        { rating: 4 },
        {
          userId: first.author.id,
          phoneNumberVerified: true,
          activeOrgId: null,
        },
      ),
    ).rejects.toMatchObject({ code: 'validation_error' });

    const second = await makeReviewFixture();
    const membershipReview = await reviewsService.create(
      {
        designerProfileId: second.designer.id,
        rating: 5,
        body: 'The original review is valid before the author joins the designer team.',
      },
      {
        userId: second.author.id,
        phoneNumberVerified: true,
        activeOrgId: null,
      },
    );
    await db.insert(schema.member).values({
      id: `member-${second.author.id}`,
      organizationId: second.organization.id,
      userId: second.author.id,
      role: 'member',
      createdAt: new Date(),
    });

    await expect(
      reviewsService.update(
        membershipReview.id,
        { rating: 4 },
        {
          userId: second.author.id,
          phoneNumberVerified: true,
          activeOrgId: second.organization.id,
        },
      ),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('withholds published reviews when the designer profile is suspended', async () => {
    const { designer, author, admin } = await makeReviewFixture();
    const review = await reviewsService.create(
      {
        designerProfileId: designer.id,
        rating: 5,
        body: 'This published review must disappear when the designer is suspended.',
      },
      {
        userId: author.id,
        phoneNumberVerified: true,
        activeOrgId: null,
      },
    );
    await reviewsService.publish(review.id, { userId: admin.id });
    await db
      .update(schema.designerProfile)
      .set({ status: 'suspended' })
      .where(eq(schema.designerProfile.id, designer.id));

    const page = await reviewsService.listPublished({
      designerProfileId: designer.id,
      page: 1,
      limit: 20,
    });
    expect(page).toMatchObject({
      items: [],
      averageRating: 0,
      reviewCount: 0,
    });
  });

  it('rejects impossible review chronology and moderation audit pairs at the database boundary', async () => {
    const { designer, author } = await makeReviewFixture();
    const review = await reviewsService.create(
      {
        designerProfileId: designer.id,
        rating: 4,
        body: 'This review supplies a valid row for database invariant checks.',
      },
      {
        userId: author.id,
        phoneNumberVerified: true,
        activeOrgId: null,
      },
    );

    await expect(
      db.insert(schema.reviewModerationEvent).values({
        reviewId: review.id,
        actorUserId: author.id,
        action: 'edit',
        fromStatus: null,
        toStatus: 'pending',
      }),
    ).rejects.toMatchObject({
      cause: { constraint: 'review_moderation_event_transition_check' },
    });

    await expect(
      db
        .update(schema.review)
        .set({ updatedAt: new Date('2000-01-01T00:00:00.000Z') })
        .where(eq(schema.review.id, review.id)),
    ).rejects.toMatchObject({
      cause: { constraint: 'review_timestamp_order_check' },
    });
  });

  it('records rejection reasons and supports removal after a dispute', async () => {
    const first = await makeReviewFixture();
    const rejectedReview = await reviewsService.create(
      {
        designerProfileId: first.designer.id,
        rating: 1,
        body: 'This review is being used to verify the moderation rejection path.',
      },
      {
        userId: first.author.id,
        phoneNumberVerified: true,
        activeOrgId: null,
      },
    );
    const rejected = await reviewsService.reject(
      rejectedReview.id,
      {
        reasonCode: 'insufficient-detail',
        note: 'The submission does not include enough firsthand project detail.',
      },
      { userId: first.admin.id },
    );
    expect(rejected.status).toBe('rejected');

    const second = await makeReviewFixture();
    const removableReview = await reviewsService.create(
      {
        designerProfileId: second.designer.id,
        rating: 2,
        body: 'This review is being used to verify the disputed removal path.',
      },
      {
        userId: second.author.id,
        phoneNumberVerified: true,
        activeOrgId: null,
      },
    );
    await reviewsService.publish(removableReview.id, { userId: second.admin.id });
    await reviewsService.dispute(
      removableReview.id,
      { note: 'The designer has supplied evidence for moderation review.' },
      {
        userId: second.owner.id,
        phoneNumberVerified: true,
        activeOrgId: second.organization.id,
      },
    );
    const removed = await reviewsService.resolveDispute(
      removableReview.id,
      {
        decision: 'remove',
        note: 'The evidence confirms that the review violates the review policy.',
      },
      { userId: second.admin.id },
    );
    expect(removed.status).toBe('removed');

    const [rejectEvent, removeEvent] = await Promise.all([
      db
        .select()
        .from(schema.reviewModerationEvent)
        .where(eq(schema.reviewModerationEvent.reviewId, rejectedReview.id))
        .then((events) => events.find((event) => event.action === 'reject')),
      db
        .select()
        .from(schema.reviewModerationEvent)
        .where(eq(schema.reviewModerationEvent.reviewId, removableReview.id))
        .then((events) => events.find((event) => event.action === 'remove')),
    ]);
    expect(rejectEvent).toMatchObject({
      reasonCode: 'insufficient-detail',
      toStatus: 'rejected',
    });
    expect(removeEvent).toMatchObject({ toStatus: 'removed' });
  });

  it('fully recomputes average rating and histogram across published reviews', async () => {
    const { designer, author, admin } = await makeReviewFixture();
    const secondAuthor = await makeUser({
      name: 'Second Review Author',
      phoneNumber: '+919800004099',
      phoneNumberVerified: true,
    });
    const first = await reviewsService.create(
      {
        designerProfileId: designer.id,
        rating: 5,
        body: 'Excellent communication and a final result that exceeded our expectations.',
      },
      {
        userId: author.id,
        phoneNumberVerified: true,
        activeOrgId: null,
      },
    );
    const second = await reviewsService.create(
      {
        designerProfileId: designer.id,
        rating: 3,
        body: 'A solid result with a few scheduling issues during the final handover.',
      },
      {
        userId: secondAuthor.id,
        phoneNumberVerified: true,
        activeOrgId: null,
      },
    );
    await reviewsService.publish(first.id, { userId: admin.id });
    await reviewsService.publish(second.id, { userId: admin.id });

    const page = await reviewsService.listPublished({
      designerProfileId: designer.id,
      page: 1,
      limit: 20,
    });
    expect(page).toMatchObject({
      averageRating: 4,
      reviewCount: 2,
      histogram: { 1: 0, 2: 0, 3: 1, 4: 0, 5: 1 },
    });

    const [profile] = await db
      .select()
      .from(schema.designerProfile)
      .where(eq(schema.designerProfile.id, designer.id));
    expect(Number(profile?.avgRating)).toBe(4);
    expect(profile?.reviewCount).toBe(2);
  });
});
