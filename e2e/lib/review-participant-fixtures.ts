import { randomInt, randomUUID } from 'node:crypto';
import { config } from '@repo/config';
import { db, eq, inArray, schema } from '@repo/db';
import { assertTestDb, makeDesigner, makeOrganization, makeUser } from '@repo/db/testing';

async function cleanupReviewFixture(
  userIds: string[],
  organizationId?: string,
  designerProfileId?: string,
) {
  await assertTestDb();
  if (designerProfileId) {
    const reviewIds = db
      .select({ id: schema.review.id })
      .from(schema.review)
      .where(eq(schema.review.designerProfileId, designerProfileId));
    await db
      .delete(schema.reviewModerationEvent)
      .where(inArray(schema.reviewModerationEvent.reviewId, reviewIds));
    await db.delete(schema.review).where(eq(schema.review.designerProfileId, designerProfileId));
  }
  if (organizationId) {
    await db.delete(schema.organization).where(eq(schema.organization.id, organizationId));
  }
  if (userIds.length > 0) await db.delete(schema.user).where(inArray(schema.user.id, userIds));
}

/** Creates only unique local test data and cleans partial setup after a failed attempt. */
export async function createReviewParticipantFixture() {
  const database = new URL(config.DATABASE_URL);
  if (
    !['localhost', '127.0.0.1'].includes(database.hostname) ||
    !database.pathname.endsWith('_test') ||
    config.DATABASE_URL !== config.DATABASE_URL_TEST
  ) {
    throw new Error(
      'Review participant E2E requires matching local DATABASE_URL and DATABASE_URL_TEST ending in _test.',
    );
  }
  await assertTestDb();

  const suffix = randomUUID();
  const userIds: string[] = [];
  let organizationId: string | undefined;
  let designerProfileId: string | undefined;
  try {
    const author = await makeUser({
      name: 'Review Journey Visitor',
      email: `review-journey-visitor-${suffix}@example.test`,
      phoneNumber: `+9198${randomInt(10_000_000, 99_999_999)}`,
      phoneNumberVerified: true,
      status: 'active',
    });
    userIds.push(author.id);
    const rejectedAuthor = await makeUser({
      name: 'Review Rejection Visitor',
      email: `review-rejected-${suffix}@example.test`,
      phoneNumber: `+9195${randomInt(10_000_000, 99_999_999)}`,
      phoneNumberVerified: true,
      status: 'active',
    });
    userIds.push(rejectedAuthor.id);
    const owner = await makeUser({
      name: 'Review Journey Designer',
      email: `review-journey-designer-${suffix}@example.test`,
      phoneNumber: `+9197${randomInt(10_000_000, 99_999_999)}`,
      phoneNumberVerified: true,
      role: 'designer',
      status: 'active',
    });
    userIds.push(owner.id);
    const admin = await makeUser({
      name: 'Review Journey Moderator',
      email: `review-journey-admin-${suffix}@example.test`,
      phoneNumber: `+9196${randomInt(10_000_000, 99_999_999)}`,
      phoneNumberVerified: true,
      role: 'admin',
      status: 'active',
    });
    userIds.push(admin.id);
    const organization = await makeOrganization({
      name: `Review Journey Studio ${suffix}`,
      slug: `review-journey-studio-${suffix}`,
    });
    organizationId = organization.id;
    const profile = await makeDesigner({
      userId: owner.id,
      orgId: organization.id,
      slug: `review-journey-studio-${suffix}`,
      displayName: 'Review Journey Studio',
      status: 'active',
    });
    designerProfileId = profile.id;
    await db.insert(schema.member).values({
      id: randomUUID(),
      organizationId: organization.id,
      userId: owner.id,
      role: 'owner',
      createdAt: new Date(),
    });

    let cleaned = false;
    return {
      author,
      rejectedAuthor,
      owner,
      admin,
      organization,
      profile,
      async cleanup() {
        if (cleaned) return;
        await cleanupReviewFixture(userIds, organization.id, profile.id);
        cleaned = true;
      },
    };
  } catch (error) {
    await cleanupReviewFixture(userIds, organizationId, designerProfileId);
    throw error;
  }
}
