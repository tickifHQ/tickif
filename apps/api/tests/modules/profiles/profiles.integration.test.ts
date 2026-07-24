import { describe, it, expect } from 'vitest';
import { config } from '@repo/config';
import { db, schema, eq } from '@repo/db';
import { makeDesigner, makeLead, makeOrganization, makeProject } from '@repo/db/testing';
import { app } from '../../../src/app.js';
import { signInWithGoogle, createAuthedSession, createRoleSession } from '../../helpers/auth.js';
import { getSession } from '@repo/auth';

/**
 * Integration tests for the profiles module (E-39).
 * Tests the full HTTP path with real auth sessions and the test DB.
 *
 * Security regressions covered:
 * - Ban bypass in onboarding (#98)
 * - Unverified-phone publish gate (#97)
 * - Status-gated public read (#99)
 * - Cross-tenant write prevention (#99)
 * - Footprint replace semantics (#99)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function json(res: Response): Promise<any> {
  return res.json();
}

async function request(method: string, path: string, opts?: { cookie?: string; body?: unknown }) {
  return app.request(path, {
    method,
    headers: {
      ...(opts?.cookie ? { cookie: opts.cookie } : {}),
      ...(opts?.body ? { 'content-type': 'application/json' } : {}),
    },
    ...(opts?.body ? { body: JSON.stringify(opts.body) } : {}),
  });
}

/** Helper: seed a taxonomy term and return its ID. */
async function seedTaxonomy(kind: string, slug: string, label: string): Promise<string> {
  const [row] = await db
    .insert(schema.taxonomy)
    .values({ kind: kind as 'city', slug, label })
    .returning({ id: schema.taxonomy.id });
  return row!.id;
}

describe('POST /api/profiles/me — onboarding', () => {
  it('creates profile + org + membership for a Google-SSO user (201)', async () => {
    const { cookie } = await signInWithGoogle({
      sub: 'g-onboard-1',
      email: 'onboard1@test.com',
      name: 'Onboard User',
    });

    const res = await request('POST', '/api/profiles/me', {
      cookie,
      body: { entityType: 'individual', userName: 'Onboard User' },
    });

    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.profile.displayName).toBe('Onboard User');
    expect(body.organization.name).toBe('Onboard User');
  });

  it('returns existing profile on re-submit (200 idempotent)', async () => {
    const { cookie } = await signInWithGoogle({
      sub: 'g-onboard-2',
      email: 'onboard2@test.com',
    });

    const first = await request('POST', '/api/profiles/me', {
      cookie,
      body: { entityType: 'company', userName: 'User', companyName: 'Acme Co' },
    });
    expect(first.status).toBe(201);

    const second = await request('POST', '/api/profiles/me', {
      cookie,
      body: { entityType: 'individual', userName: 'Different' },
    });
    expect(second.status).toBe(200);
    const body = await json(second);
    expect(body.profile.displayName).toBe('Acme Co');
  });

  it('allows phone-OTP user to complete onboarding (#157)', async () => {
    const { cookie } = await createAuthedSession('+919800001001');
    const res = await request('POST', '/api/profiles/me', {
      cookie,
      body: { entityType: 'individual', userName: 'OTP Designer' },
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.profile.displayName).toBe('OTP Designer');
    expect(body.profile.entityType).toBe('individual');
    expect(body.organization).toBeDefined();
  });

  it('rejects unauthenticated (401)', async () => {
    const res = await request('POST', '/api/profiles/me', {
      body: { entityType: 'individual', userName: 'Nobody' },
    });
    expect(res.status).toBe(401);
  });

  // Regression: ban enforcement (#98 review)
  it('rejects banned user even with valid Google SSO (403)', async () => {
    const { cookie } = await signInWithGoogle({
      sub: 'g-banned-1',
      email: 'banned@test.com',
    });
    const session = await getSession(new Headers({ cookie }), { disableCookieCache: true });
    await db
      .update(schema.user)
      .set({ banned: true })
      .where(eq(schema.user.id, session!.user.id));
    const freshCookie = cookie
      .split('; ')
      .filter((c) => !c.startsWith('better-auth.session_data'))
      .join('; ');

    const res = await request('POST', '/api/profiles/me', {
      cookie: freshCookie,
      body: { entityType: 'individual', userName: 'Banned' },
    });
    expect(res.status).toBe(403);
  });

  it('validates taxonomy IDs (422 for non-existent)', async () => {
    const { cookie } = await signInWithGoogle({
      sub: 'g-onboard-3',
      email: 'onboard3@test.com',
    });
    const res = await request('POST', '/api/profiles/me', {
      cookie,
      body: {
        entityType: 'individual',
        userName: 'User',
        scopeIds: ['11111111-1111-4111-8111-111111111111'],
      },
    });
    expect(res.status).toBe(422);
  });

  it('upgrades user role to designer and status to active', async () => {
    const { cookie } = await signInWithGoogle({
      sub: 'g-onboard-5',
      email: 'onboard5@test.com',
    });
    await request('POST', '/api/profiles/me', {
      cookie,
      body: { entityType: 'individual', userName: 'Designer' },
    });
    const session = await getSession(new Headers({ cookie }), { disableCookieCache: true });
    const [user] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, session!.user.id));
    expect(user!.role).toBe('designer');
    expect(user!.status).toBe('active');
  });

  it('persists address during onboarding', async () => {
    const { cookie } = await signInWithGoogle({
      sub: 'g-onboard-addr',
      email: 'onboard-addr@test.com',
    });
    const res = await request('POST', '/api/profiles/me', {
      cookie,
      body: {
        entityType: 'individual',
        userName: 'Address User',
        address: 'Koramangala, Bengaluru',
      },
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    // Verify address persisted by reading from DB
    const [profile] = await db
      .select({ address: schema.designerProfile.address })
      .from(schema.designerProfile)
      .where(eq(schema.designerProfile.id, body.profile.id));
    expect(profile!.address).toBe('Koramangala, Bengaluru');
  });
});

describe('GET /api/profiles/me/completion', () => {
  // Regression: unverified phone publish gate (#97 review)
  it('does not count unverified phone as contact', async () => {
    const { cookie } = await signInWithGoogle({
      sub: 'g-comp-unverified',
      email: 'unverified@test.com',
    });
    await request('POST', '/api/profiles/me', {
      cookie,
      body: { entityType: 'individual', userName: 'Unverified Phone User' },
    });
    const session = await getSession(new Headers({ cookie }), { disableCookieCache: true });
    await db
      .update(schema.user)
      .set({ phoneNumber: '+919999999999', phoneNumberVerified: false, emailVerified: false })
      .where(eq(schema.user.id, session!.user.id));

    const res = await request('GET', '/api/profiles/me/completion', { cookie });
    const body = await json(res);
    expect(body.missing).toContain('contact');
  });

  it('counts verified phone as contact', async () => {
    const { cookie } = await signInWithGoogle({
      sub: 'g-comp-verified',
      email: 'verified@test.com',
    });
    await request('POST', '/api/profiles/me', {
      cookie,
      body: { entityType: 'individual', userName: 'Verified Phone User' },
    });
    const session = await getSession(new Headers({ cookie }), { disableCookieCache: true });
    await db
      .update(schema.user)
      .set({ phoneNumber: '+919999999998', phoneNumberVerified: true })
      .where(eq(schema.user.id, session!.user.id));

    const res = await request('GET', '/api/profiles/me/completion', { cookie });
    const body = await json(res);
    expect(body.missing).not.toContain('contact');
  });

  it('returns concrete score for freshly onboarded user (33 — displayName + contact)', async () => {
    const { cookie } = await signInWithGoogle({
      sub: 'g-comp-score',
      email: 'score@test.com',
    });
    await request('POST', '/api/profiles/me', {
      cookie,
      body: { entityType: 'individual', userName: 'Score User' },
    });

    const res = await request('GET', '/api/profiles/me/completion', { cookie });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.steps).toHaveLength(4);
    // displayName (filled) + contact via verified email = 2/6 = 33%
    expect(body.score).toBe(33);
    expect(body.missing).toContain('location');
  });

  it('address satisfies location requirement in completion score', async () => {
    const { cookie } = await signInWithGoogle({
      sub: 'g-comp-addr',
      email: 'comp-addr@test.com',
    });
    await request('POST', '/api/profiles/me', {
      cookie,
      body: {
        entityType: 'individual',
        userName: 'Addr User',
        address: 'Koramangala, Bengaluru',
      },
    });

    const res = await request('GET', '/api/profiles/me/completion', { cookie });
    expect(res.status).toBe(200);
    const body = await json(res);
    // displayName + contact + location (via address) = 3/6 = 50%
    expect(body.score).toBe(50);
    expect(body.missing).not.toContain('location');
  });

  it('rejects unauthenticated (401)', async () => {
    const res = await request('GET', '/api/profiles/me/completion');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/profiles/me/dashboard', () => {
  it('returns the Linear dashboard summary for the active organization', async () => {
    const { cookie } = await signInWithGoogle({
      sub: 'g-dashboard-summary',
      email: 'dashboard-summary@test.com',
    });
    await request('POST', '/api/profiles/me', {
      cookie,
      body: {
        entityType: 'individual',
        userName: 'Summary Studio',
        address: 'Indiranagar, Bangalore',
      },
    });
    const session = await getSession(new Headers({ cookie }), { disableCookieCache: true });
    const [profile] = await db
      .select()
      .from(schema.designerProfile)
      .where(eq(schema.designerProfile.userId, session!.user.id));
    await makeProject({ designerId: profile!.id, status: 'published', title: 'Published' });
    await makeProject({ designerId: profile!.id, status: 'submitted', title: 'Submitted' });
    await makeProject({ designerId: profile!.id, status: 'in_review', title: 'In Review' });
    await makeProject({ designerId: profile!.id, status: 'draft', title: 'Draft' });
    await makeProject({
      designerId: profile!.id,
      status: 'changes_requested',
      title: 'Changes Requested',
    });
    await makeLead({ organizationId: profile!.orgId, status: 'new' });
    await makeLead({ organizationId: profile!.orgId, status: 'contacted' });
    await makeLead({ status: 'new' });

    const res = await request('GET', '/api/profiles/me/dashboard', { cookie });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toEqual({
      profileCompletion: {
        score: 50,
        missing: ['bio', 'logo', 'scope'],
      },
      projects: {
        total: 5,
        published: 1,
        inReview: 2,
        draft: 2,
      },
      leads: {
        total: 2,
        new: 1,
      },
      shareUrl: expect.any(String),
    });
    const shareUrl = new URL(body.shareUrl);
    expect(shareUrl.origin).toBe(new URL(config.PUBLIC_WEB_URL).origin);
    expect(shareUrl.pathname).toMatch(/^\/d\/summary-studio-[a-z0-9]+$/);
    expect(body.profileCompletion).not.toHaveProperty('steps');
  });

  it('rejects unauthenticated dashboard summary requests', async () => {
    const res = await request('GET', '/api/profiles/me/dashboard');
    expect(res.status).toBe(401);
  });

  it('rejects authenticated users without a designer organization', async () => {
    const { cookie } = await createRoleSession('+919800001020', 'designer');

    const res = await request('GET', '/api/profiles/me/dashboard', { cookie });

    expect(res.status).toBe(403);
  });

  it('scopes dashboard summary to the active organization', async () => {
    const { cookie, userId } = await createRoleSession('+919800001021', 'designer');
    const orgA = await makeOrganization({ name: 'Alpha Studio', slug: 'alpha-studio' });
    const orgB = await makeOrganization({ name: 'Beta Studio', slug: 'beta-studio' });
    await db.insert(schema.member).values([
      {
        id: `mem-alpha-${userId}`,
        organizationId: orgA.id,
        userId,
        role: 'owner',
        createdAt: new Date(),
      },
      {
        id: `mem-beta-${userId}`,
        organizationId: orgB.id,
        userId,
        role: 'owner',
        createdAt: new Date(),
      },
    ]);
    const alphaProfile = await makeDesigner({
      orgId: orgA.id,
      userId,
      displayName: 'Alpha Studio',
    });
    const [betaProfile] = await db
      .insert(schema.designerProfile)
      .values({
        orgId: orgB.id,
        displayName: 'Beta Studio',
        address: 'Indiranagar, Bangalore',
      })
      .returning();
    await makeProject({ designerId: alphaProfile.id, status: 'published', title: 'Alpha' });
    await makeProject({ designerId: betaProfile!.id, status: 'published', title: 'Beta Published' });
    await makeProject({ designerId: betaProfile!.id, status: 'draft', title: 'Beta Draft' });
    await db
      .update(schema.session)
      .set({ activeOrganizationId: orgB.id })
      .where(eq(schema.session.userId, userId));
    const freshCookie = cookie
      .split('; ')
      .filter((c) => !c.startsWith('better-auth.session_data'))
      .join('; ');

    const res = await request('GET', '/api/profiles/me/dashboard', { cookie: freshCookie });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.profileCompletion.score).toBe(50);
    expect(body.profileCompletion.missing).toEqual(['bio', 'logo', 'scope']);
    expect(body.projects).toEqual({
      total: 2,
      published: 1,
      inReview: 0,
      draft: 1,
    });
    expect(body.shareUrl).toBe(
      new URL('/d/beta-studio', config.PUBLIC_WEB_URL).toString(),
    );
  });
});

describe('GET /api/profiles/:id — public read', () => {
  it('returns public projection for active profiles (no corporate fields)', async () => {
    const designer = await makeDesigner({
      displayName: 'Public Studio',
      bio: 'We build things',
      status: 'active',
      websiteUrl: 'https://secret.com',
      staffCount: 50,
      testimonialBannerEnabled: true,
    });

    const res = await request('GET', `/api/profiles/${designer.id}`);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.displayName).toBe('Public Studio');
    expect(body).not.toHaveProperty('websiteUrl');
    expect(body).not.toHaveProperty('staffCount');
    expect(body).not.toHaveProperty('orgId');
    expect(body).not.toHaveProperty('updatedAt');
  });

  it('returns public projection by organization slug', async () => {
    const org = await makeOrganization({ name: 'Studio Noir', slug: 'studio-noir' });
    const designer = await makeDesigner({
      orgId: org.id,
      displayName: 'Studio Noir',
      status: 'active',
    });

    const res = await request('GET', '/api/profiles/slug/studio-noir');

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.id).toBe(designer.id);
    expect(body.displayName).toBe('Studio Noir');
  });

  it('returns 404 for unknown organization slug', async () => {
    const res = await request('GET', '/api/profiles/slug/missing-studio');
    expect(res.status).toBe(404);
  });

  it('returns 404 for non-active organization slug', async () => {
    const org = await makeOrganization({ name: 'Draft Studio', slug: 'draft-studio' });
    await makeDesigner({
      orgId: org.id,
      displayName: 'Draft Studio',
      status: 'draft',
    });

    const res = await request('GET', '/api/profiles/slug/draft-studio');

    expect(res.status).toBe(404);
  });

  // Regression: status-gated public read (#99 review)
  it('returns 404 for draft profiles (not publicly visible)', async () => {
    const designer = await makeDesigner({ status: 'draft', displayName: 'Draft' });
    const res = await request('GET', `/api/profiles/${designer.id}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for suspended profiles', async () => {
    const designer = await makeDesigner({ status: 'suspended', displayName: 'Suspended' });
    const res = await request('GET', `/api/profiles/${designer.id}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for non-existent profile', async () => {
    const res = await request('GET', '/api/profiles/11111111-1111-4111-8111-111111111111');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/profiles/me — update', () => {
  async function setupDesignerWithSession() {
    const { cookie } = await signInWithGoogle({
      sub: `g-patch-${Date.now()}`,
      email: `patch-${Date.now()}@test.com`,
    });
    await request('POST', '/api/profiles/me', {
      cookie,
      body: { entityType: 'individual', userName: 'Patch User' },
    });
    const session = await getSession(new Headers({ cookie }), { disableCookieCache: true });
    const [member] = await db
      .select()
      .from(schema.member)
      .where(eq(schema.member.userId, session!.user.id));
    await db
      .update(schema.session)
      .set({ activeOrganizationId: member!.organizationId })
      .where(eq(schema.session.userId, session!.user.id));
    const freshCookie = cookie
      .split('; ')
      .filter((c) => !c.startsWith('better-auth.session_data'))
      .join('; ');
    return { cookie: freshCookie, userId: session!.user.id, orgId: member!.organizationId };
  }

  it('reads current profile with active organization context and share URL', async () => {
    const { cookie } = await setupDesignerWithSession();

    const res = await request('GET', '/api/profiles/me', { cookie });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.displayName).toBe('Patch User');
    expect(body.organization.name).toBe('Patch User');
    expect(body.organization.slug).toMatch(/^patch-user/);
    expect(new URL(body.shareUrl).pathname).toBe(`/d/${body.organization.slug}`);
  });

  it('updates profile fields (partial — bio only)', async () => {
    const { cookie } = await setupDesignerWithSession();
    const res = await request('PATCH', '/api/profiles/me', {
      cookie,
      body: { bio: 'Updated bio' },
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.bio).toBe('Updated bio');
    expect(body.displayName).toBe('Patch User');
  });

  it('updates and returns address field', async () => {
    const { cookie } = await setupDesignerWithSession();
    const res = await request('PATCH', '/api/profiles/me', {
      cookie,
      body: { address: 'HSR Layout, Bengaluru 560102' },
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.address).toBe('HSR Layout, Bengaluru 560102');
  });

  it('rejects when no active organization set (422)', async () => {
    const { cookie } = await createRoleSession('+919800001010', 'designer');
    const res = await request('PATCH', '/api/profiles/me', {
      cookie,
      body: { bio: 'test' },
    });
    expect(res.status).toBe(422);
  });

  // Regression: cross-tenant write prevention — attacker with own org targets victim's org
  it('rejects attacker who sets activeOrganizationId to a victim org (403)', async () => {
    // Victim sets up their own org + profile
    const { orgId: victimOrgId } = await setupDesignerWithSession();

    // Attacker has their own Google account + org
    const { cookie: attackerCookie } = await signInWithGoogle({
      sub: `g-attacker-${Date.now()}`,
      email: `attacker-${Date.now()}@test.com`,
    });
    await request('POST', '/api/profiles/me', {
      cookie: attackerCookie,
      body: { entityType: 'individual', userName: 'Attacker' },
    });
    const attackerSession = await getSession(new Headers({ cookie: attackerCookie }), {
      disableCookieCache: true,
    });

    // Attacker sets their session's activeOrganizationId to the VICTIM's org
    await db
      .update(schema.session)
      .set({ activeOrganizationId: victimOrgId })
      .where(eq(schema.session.userId, attackerSession!.user.id));
    const freshAttackerCookie = attackerCookie
      .split('; ')
      .filter((c) => !c.startsWith('better-auth.session_data'))
      .join('; ');

    // Attacker tries to write to victim's profile
    const res = await request('PATCH', '/api/profiles/me', {
      cookie: freshAttackerCookie,
      body: { bio: 'hacked by attacker' },
    });
    expect(res.status).toBe(403);

    // Verify victim's profile is unchanged
    const [victimProfile] = await db
      .select()
      .from(schema.designerProfile)
      .where(eq(schema.designerProfile.orgId, victimOrgId));
    expect(victimProfile!.bio).not.toBe('hacked by attacker');
  });

  it('rejects member with plain member role (403)', async () => {
    const { orgId } = await setupDesignerWithSession();
    const { cookie: memberCookie, userId: memberId } = await createRoleSession(
      '+919800001012',
      'designer',
    );
    await db.insert(schema.member).values({
      id: `mem-plain-${memberId}`,
      organizationId: orgId,
      userId: memberId,
      role: 'member',
      createdAt: new Date(),
    });
    await db
      .update(schema.session)
      .set({ activeOrganizationId: orgId })
      .where(eq(schema.session.userId, memberId));
    const freshCookie = memberCookie
      .split('; ')
      .filter((c) => !c.startsWith('better-auth.session_data'))
      .join('; ');

    const res = await request('PATCH', '/api/profiles/me', {
      cookie: freshCookie,
      body: { bio: 'member write' },
    });
    expect(res.status).toBe(403);
  });

  // Regression: footprint replace semantics (#99 review) — full exercise
  it('replaces taxonomy footprint correctly (replace, clear, leave untouched)', async () => {
    const { cookie } = await setupDesignerWithSession();

    // Seed taxonomy terms
    const cityMumbai = await seedTaxonomy('city', 'mumbai', 'Mumbai');
    const cityDelhi = await seedTaxonomy('city', 'delhi', 'Delhi');
    const scopeRes = await seedTaxonomy('scope', 'residential', 'Residential');

    // Set initial footprint: mumbai + residential
    const r1 = await request('PATCH', '/api/profiles/me', {
      cookie,
      body: { cityIds: [cityMumbai], scopeIds: [scopeRes] },
    });
    expect(r1.status).toBe(200);
    const b1 = await json(r1);
    expect(b1.footprint).toHaveLength(2);

    // Replace cities (mumbai → delhi), scope untouched (absent from payload)
    const r2 = await request('PATCH', '/api/profiles/me', {
      cookie,
      body: { cityIds: [cityDelhi] },
    });
    expect(r2.status).toBe(200);
    const b2 = await json(r2);
    const cities = b2.footprint.filter((f: { kind: string }) => f.kind === 'city');
    const scopes = b2.footprint.filter((f: { kind: string }) => f.kind === 'scope');
    expect(cities).toHaveLength(1);
    expect(cities[0].slug).toBe('delhi'); // replaced, not appended
    expect(scopes).toHaveLength(1); // untouched

    // Clear all cities with empty array
    const r3 = await request('PATCH', '/api/profiles/me', {
      cookie,
      body: { cityIds: [] },
    });
    expect(r3.status).toBe(200);
    const b3 = await json(r3);
    const citiesAfterClear = b3.footprint.filter((f: { kind: string }) => f.kind === 'city');
    const scopesAfterClear = b3.footprint.filter((f: { kind: string }) => f.kind === 'scope');
    expect(citiesAfterClear).toHaveLength(0); // cleared
    expect(scopesAfterClear).toHaveLength(1); // still untouched

    // Bio update without taxonomy — footprint stays unchanged
    const r4 = await request('PATCH', '/api/profiles/me', {
      cookie,
      body: { bio: 'new bio' },
    });
    const b4 = await json(r4);
    expect(b4.footprint).toHaveLength(1); // scope still there
    expect(b4.bio).toBe('new bio');
  });

  it('rejects unauthenticated (401)', async () => {
    const res = await request('PATCH', '/api/profiles/me', {
      body: { bio: 'no auth' },
    });
    expect(res.status).toBe(401);
  });
});
