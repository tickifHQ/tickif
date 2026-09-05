import { describe, expect, it } from 'vitest';
import {
  ownReviewResponseSchema,
  organizationReviewsResponseSchema,
  reviewResponseSchema,
} from '@repo/contracts';
import { and, db, eq, schema } from '@repo/db';
import { makeDesigner, makeOrganization, makeTeam } from '@repo/db/testing';
import { app } from '../../../src/app.js';
import { createRoleSession, activateOrganization } from '../../helpers/auth.js';

const body = 'A considered design and clear communication throughout the entire project.';
function withoutSessionCache(cookie: string) {
  return cookie
    .split('; ')
    .filter((value) => !value.startsWith('better-auth.session_data'))
    .join('; ');
}
async function activateBranch(
  cookie: string,
  userId: string,
  organizationId: string,
  teamId: string,
) {
  const activeOrganizationCookie = await activateOrganization(cookie, organizationId);
  await db
    .update(schema.session)
    .set({ activeTeamId: teamId })
    .where(eq(schema.session.userId, userId));
  return withoutSessionCache(activeOrganizationCookie);
}
async function fixture() {
  const author = await createRoleSession('+919800008101', 'visitor');
  const other = await createRoleSession('+919800008102', 'visitor');
  const owner = await createRoleSession('+919800008103', 'designer');
  const admin = await createRoleSession('+919800008104', 'admin');
  const org = await makeOrganization();
  const profile = await makeDesigner({ userId: owner.userId, orgId: org.id, status: 'active' });
  await db.insert(schema.member).values({
    id: 'review-owner',
    organizationId: org.id,
    userId: owner.userId,
    role: 'owner',
    createdAt: new Date(),
  });
  const ownerCookie = await activateBranch(owner.cookie, owner.userId, org.id, profile.teamId);
  const submitted = await request('/api/reviews', 'POST', author.cookie, {
    designerProfileId: profile.id,
    rating: 4,
    body,
  });
  expect(submitted.status).toBe(201);
  const review = reviewResponseSchema.parse(await submitted.json());
  return { author, other, owner, ownerCookie, admin, org, profile, review };
}
function request(path: string, method = 'GET', cookie?: string, data?: unknown) {
  return app.request(path, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(data ? { 'content-type': 'application/json' } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });
}

describe('review participant boundaries', () => {
  it('keeps decision timestamps valid when the database row is ahead of the app clock', async () => {
    const { admin, review } = await fixture();
    const databaseTime = new Date(Date.now() + 1000);
    await db
      .update(schema.review)
      .set({ createdAt: databaseTime, updatedAt: databaseTime })
      .where(eq(schema.review.id, review.id));
    const response = await request(
      `/api/admin/reviews/${review.id}/publish?expectedRevision=0`,
      'POST',
      admin.cookie,
    );
    expect(response.status).toBe(200);
    const result = reviewResponseSchema.parse(await response.json());
    expect(new Date(result.publishedAt!).getTime()).toBeGreaterThanOrEqual(databaseTime.getTime());
  });
  it('shows pending only to its author/admin, supports revision-protected editing, and keeps rejected evidence private', async () => {
    const { author, other, ownerCookie, admin, profile, review } = await fixture();
    const mine = `/api/reviews/mine?designerProfileId=${profile.id}`;
    expect((await request(mine)).status).toBe(401);
    expect((await request(mine, 'GET', ownerCookie)).status).toBe(403);
    const owned = ownReviewResponseSchema.parse(
      await (await request(mine, 'GET', author.cookie)).json(),
    );
    expect(owned.item).toMatchObject({
      review: { id: review.id, status: 'pending' },
      canEdit: true,
    });
    expect(await (await request(mine, 'GET', other.cookie)).json()).toEqual({ item: null });
    expect(
      await (
        await request(
          `/api/reviews/organization?designerProfileId=${profile.id}`,
          'GET',
          ownerCookie,
        )
      ).json(),
    ).toMatchObject({ items: [], total: 0 });
    expect(
      (await request(`/api/reviews/${review.id}`, 'PATCH', author.cookie, { rating: 5 })).status,
    ).toBe(422);
    expect(
      (
        await request(`/api/reviews/${review.id}?expectedRevision=99`, 'PATCH', author.cookie, {
          rating: 5,
        })
      ).status,
    ).toBe(409);
    const edited = await request(
      `/api/reviews/${review.id}?expectedRevision=0`,
      'PATCH',
      author.cookie,
      { rating: 5, body: null },
    );
    expect(edited.status).toBe(200);
    const rejection = await request(
      `/api/admin/reviews/${review.id}/reject?expectedRevision=1`,
      'POST',
      admin.cookie,
      { note: 'Private internal evidence', reasonCode: 'unverifiable' },
    );
    expect(rejection.status).toBe(200);
    const rejected = await (await request(mine, 'GET', author.cookie)).json();
    expect(rejected).toMatchObject({ item: { review: { status: 'rejected' }, canEdit: false } });
    expect(JSON.stringify(rejected)).not.toContain('Private internal evidence');
    expect(JSON.stringify(rejected)).not.toContain('actorUserId');
  });

  it('publishes, disputes, resolves, and exposes participant feedback without the admin history', async () => {
    const { author, ownerCookie, admin, profile, review } = await fixture();
    expect(
      (
        await request(
          `/api/admin/reviews/${review.id}/publish?expectedRevision=0`,
          'POST',
          admin.cookie,
        )
      ).status,
    ).toBe(200);
    const queue = `/api/reviews/organization?designerProfileId=${profile.id}&limit=1`;
    const listed = organizationReviewsResponseSchema.parse(
      await (await request(queue, 'GET', ownerCookie)).json(),
    );
    expect(listed).toMatchObject({ total: 1, totalPages: 1, items: [{ canEdit: false }] });
    const dispute = `/api/reviews/${review.id}/dispute?expectedRevision=1`;
    expect((await request(dispute, 'POST', ownerCookie, { note: ' ' })).status).toBe(422);
    expect(
      (await request(dispute, 'POST', ownerCookie, { note: 'Incorrect handover details' })).status,
    ).toBe(200);
    const publicPage = await request(`/api/reviews?designerProfileId=${profile.id}`);
    expect(await publicPage.json()).toMatchObject({ items: [], reviewCount: 0 });
    expect(
      (
        await request(
          `/api/admin/reviews/${review.id}/resolve-dispute?expectedRevision=2`,
          'POST',
          admin.cookie,
          { decision: 'publish', note: 'Evidence supports the reviewer' },
        )
      ).status,
    ).toBe(200);
    const detail = await (await request(queue, 'GET', ownerCookie)).json();
    expect(detail).toMatchObject({
      items: [
        {
          dispute: { note: 'Incorrect handover details' },
          resolution: { decision: 'publish', note: 'Evidence supports the reviewer' },
        },
      ],
    });
    expect(JSON.stringify(detail)).not.toContain('actorUserId');
    expect(JSON.stringify(detail)).not.toContain('history');
    const publicData = await (await request(`/api/reviews?designerProfileId=${profile.id}`)).json();
    expect(publicData).toMatchObject({ reviewCount: 1, histogram: { 4: 1 } });
    expect(JSON.stringify(publicData)).not.toContain('Evidence supports');
    await db
      .update(schema.review)
      .set({
        createdAt: new Date(Date.now() - 26 * 60 * 60 * 1000),
        publishedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      })
      .where(eq(schema.review.id, review.id));
    const own = await (
      await request(`/api/reviews/mine?designerProfileId=${profile.id}`, 'GET', author.cookie)
    ).json();
    expect(own).toMatchObject({ item: { canEdit: false } });
    expect(
      (
        await request(`/api/reviews/${review.id}?expectedRevision=3`, 'PATCH', author.cookie, {
          rating: 3,
        })
      ).status,
    ).toBe(409);
  });

  it('rejects self-review, account lifecycle, unverified phone, foreign orgs, viewers and frozen membership', async () => {
    const { author, owner, ownerCookie, admin, profile, org } = await fixture();
    const payload = { designerProfileId: profile.id, rating: 2 };
    expect((await request('/api/reviews', 'POST', ownerCookie, payload)).status).toBe(403);
    // Clear scope to exercise self-review prevention rather than just the context gate.
    await db
      .update(schema.session)
      .set({ activeOrganizationId: null })
      .where(eq(schema.session.userId, owner.userId));
    expect((await request('/api/reviews', 'POST', owner.cookie, payload)).status).toBe(403);
    expect((await request('/api/reviews', 'POST', admin.cookie, payload)).status).toBe(403);
    await db
      .update(schema.user)
      .set({ phoneNumberVerified: false })
      .where(eq(schema.user.id, author.userId));
    expect((await request('/api/reviews', 'POST', author.cookie, payload)).status).toBe(422);
    await db
      .update(schema.user)
      .set({ status: 'suspended', phoneNumberVerified: true })
      .where(eq(schema.user.id, author.userId));
    expect((await request('/api/reviews', 'POST', author.cookie, payload)).status).toBe(403);
    const activated = await activateBranch(owner.cookie, owner.userId, org.id, profile.teamId);
    const foreign = await makeDesigner({ status: 'active' });
    expect(
      (await request(`/api/reviews/organization?designerProfileId=${foreign.id}`, 'GET', activated))
        .status,
    ).toBe(403);
    await db
      .update(schema.member)
      .set({ role: 'viewer' })
      .where(eq(schema.member.userId, owner.userId));
    expect(
      (await request(`/api/reviews/organization?designerProfileId=${profile.id}`, 'GET', activated))
        .status,
    ).toBe(403);
    await db
      .update(schema.member)
      .set({ role: 'owner', frozen: true, frozenAt: new Date(), freezeRank: 1 })
      .where(eq(schema.member.userId, owner.userId));
    expect(
      (await request(`/api/reviews/organization?designerProfileId=${profile.id}`, 'GET', activated))
        .status,
    ).toBe(403);
  });

  it('rejects another branch in the selected organization', async () => {
    const { owner, ownerCookie, org, profile } = await fixture();
    const branch = await makeTeam({ organizationId: org.id, name: 'Other branch' });
    await db.insert(schema.teamMember).values({
      id: 'other-review-branch',
      teamId: branch.id,
      userId: owner.userId,
      createdAt: new Date(),
    });
    await db
      .update(schema.session)
      .set({ activeTeamId: branch.id })
      .where(eq(schema.session.userId, owner.userId));
    expect(
      (
        await request(
          `/api/reviews/organization?designerProfileId=${profile.id}`,
          'GET',
          ownerCookie,
        )
      ).status,
    ).toBe(403);
  });

  it('requires an active branch for organization reads and disputes', async () => {
    const { owner, ownerCookie, admin, profile, review } = await fixture();
    expect(
      (
        await request(
          `/api/admin/reviews/${review.id}/publish?expectedRevision=0`,
          'POST',
          admin.cookie,
        )
      ).status,
    ).toBe(200);
    await db
      .update(schema.session)
      .set({ activeTeamId: null })
      .where(eq(schema.session.userId, owner.userId));
    const rollupCookie = withoutSessionCache(ownerCookie);

    expect(
      (
        await request(
          `/api/reviews/organization?designerProfileId=${profile.id}`,
          'GET',
          rollupCookie,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          `/api/reviews/${review.id}/dispute?expectedRevision=1`,
          'POST',
          rollupCookie,
          { note: 'A roll-up context must not select a branch implicitly.' },
        )
      ).status,
    ).toBe(404);

    await db
      .update(schema.session)
      .set({ activeTeamId: profile.teamId })
      .where(eq(schema.session.userId, owner.userId));
    await db
      .delete(schema.teamMember)
      .where(
        and(
          eq(schema.teamMember.teamId, profile.teamId),
          eq(schema.teamMember.userId, owner.userId),
        ),
      );
    expect(
      (
        await request(
          `/api/reviews/organization?designerProfileId=${profile.id}`,
          'GET',
          rollupCookie,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          `/api/reviews/${review.id}/dispute?expectedRevision=1`,
          'POST',
          rollupCookie,
          { note: 'Revoked branch membership must prevent disputes.' },
        )
      ).status,
    ).toBe(404);
  });
});
