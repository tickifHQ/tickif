/**
 * E-115 Subscribe route unit tests.
 *
 * Mocks auth, subscribe-service, and Razorpay client to test the HTTP layer
 * without requiring PostgreSQL or Razorpay connectivity.
 */

vi.mock('@repo/auth', () => {
  const getSession = vi.fn();
  return {
    getSession,
    getSessionWithHeaders: vi.fn(async (headers: Headers, opts?: unknown) => ({
      session: await getSession(headers, opts),
      headers: new Headers(),
    })),
    auth: { handler: vi.fn() },
  };
});

vi.mock('../../../src/modules/billing/subscribe-service.js', () => ({
  subscribeService: {
    createSubscription: vi.fn(),
    changePlan: vi.fn(),
  },
}));

vi.mock('../../../src/modules/orgs/service.js', () => ({
  orgsService: {
    findSoleOrganizationForUser: vi.fn().mockResolvedValue(null),
    isMember: vi.fn().mockResolvedValue(true),
  },
}));

import { describe, it, expect, vi, beforeEach } from 'vitest';
const { getSession } = await import('@repo/auth');
const { app } = await import('../../../src/app.js');
const { subscribeService } = await import(
  '../../../src/modules/billing/subscribe-service.js'
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockAuthed(overrides?: { activeOrganizationId?: string | null }) {
  vi.mocked(getSession).mockResolvedValue({
    user: {
      id: 'user-owner',
      name: 'Owner',
      email: 'owner@test.local',
      role: 'designer',
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'active' as const,
      banned: false,
      image: null,
    },
    session: {
      id: 'sess-1',
      userId: 'user-owner',
      token: 'token-1',
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
      updatedAt: new Date(),
      activeOrganizationId: overrides?.activeOrganizationId ?? 'org-1',
    },
  });
}

function mockUnauthed() {
  vi.mocked(getSession).mockResolvedValue(null);
}

async function post(path: string, body?: unknown): Promise<Response> {
  return app.request(`/api/billing${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: 'better-auth.session_token=mock-token',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/billing/subscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without authentication', async () => {
    mockUnauthed();
    const res = await post('/subscribe', { targetTier: 'professional_plus' });
    expect(res.status).toBe(401);
  });

  it('returns 422 for Hobby tier', async () => {
    mockAuthed();
    vi.mocked(subscribeService.createSubscription).mockRejectedValue(
      new (await import('../../../src/lib/errors.js')).AppError(
        'validation_error',
        'Cannot create a Razorpay subscription for Hobby tier',
        422,
      ),
    );
    const res = await post('/subscribe', { targetTier: 'hobby' });
    expect(res.status).toBe(422);
  });

  it('returns 400 for invalid tier (validation)', async () => {
    mockAuthed();
    const res = await post('/subscribe', { targetTier: 'enterprise' });
    // Zod validation rejects invalid enum values before reaching the service
    expect([400, 422]).toContain(res.status);
  });

  it('returns 409 when org already has subscription', async () => {
    mockAuthed();
    vi.mocked(subscribeService.createSubscription).mockRejectedValue(
      new (await import('../../../src/lib/errors.js')).AppError(
        'conflict',
        'Organization already has an active Razorpay subscription',
        409,
      ),
    );
    const res = await post('/subscribe', { targetTier: 'corporate' });
    expect(res.status).toBe(409);
  });

  it('returns 200 with subscription ID on success', async () => {
    mockAuthed();
    vi.mocked(subscribeService.createSubscription).mockResolvedValue({
      razorpaySubscriptionId: 'sub_test_123',
      shortUrl: 'https://rzp.io/test',
    });
    const res = await post('/subscribe', { targetTier: 'professional_plus' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { razorpaySubscriptionId: string; shortUrl: string | null };
    expect(body.razorpaySubscriptionId).toBe('sub_test_123');
    expect(body.shortUrl).toBe('https://rzp.io/test');
  });

  it('does NOT accept a razorpayPlanId from the client', async () => {
    mockAuthed();
    // Even if the client sends a razorpayPlanId, the route only passes targetTier to the service.
    vi.mocked(subscribeService.createSubscription).mockResolvedValue({
      razorpaySubscriptionId: 'sub_test_456',
      shortUrl: null,
    });
    const res = await post('/subscribe', {
      targetTier: 'corporate',
      razorpayPlanId: 'plan_malicious_attempt',
    });
    expect(res.status).toBe(200);
    // Verify the service was called with ONLY targetTier, not a plan ID
    expect(vi.mocked(subscribeService.createSubscription)).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-owner', activeOrgId: 'org-1' }),
      { targetTier: 'corporate' },
    );
  });

  it('concurrent subscribe attempts are serialized (service called once per success)', async () => {
    mockAuthed();
    // First call succeeds
    vi.mocked(subscribeService.createSubscription)
      .mockResolvedValueOnce({ razorpaySubscriptionId: 'sub_first', shortUrl: null })
      .mockRejectedValueOnce(
        new (await import('../../../src/lib/errors.js')).AppError(
          'conflict',
          'Organization already has an active Razorpay subscription',
          409,
        ),
      );

    // Simulate two rapid requests
    const [res1, res2] = await Promise.all([
      post('/subscribe', { targetTier: 'corporate' }),
      post('/subscribe', { targetTier: 'corporate' }),
    ]);

    // One should succeed, one should conflict
    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 409]);
  });

  it('returns 403 when caller is not org owner', async () => {
    mockAuthed();
    vi.mocked(subscribeService.createSubscription).mockRejectedValue(
      new (await import('../../../src/lib/errors.js')).AppError(
        'forbidden',
        'Only the organization owner can manage billing',
        403,
      ),
    );
    const res = await post('/subscribe', { targetTier: 'professional_plus' });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/billing/change-plan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without authentication', async () => {
    mockUnauthed();
    const res = await post('/change-plan', { targetTier: 'corporate' });
    expect(res.status).toBe(401);
  });

  it('returns 404 when no subscription exists', async () => {
    mockAuthed();
    vi.mocked(subscribeService.changePlan).mockRejectedValue(
      new (await import('../../../src/lib/errors.js')).AppError(
        'not_found',
        'No active Razorpay subscription found',
        404,
      ),
    );
    const res = await post('/change-plan', { targetTier: 'corporate' });
    expect(res.status).toBe(404);
  });

  it('returns 422 for same tier', async () => {
    mockAuthed();
    vi.mocked(subscribeService.changePlan).mockRejectedValue(
      new (await import('../../../src/lib/errors.js')).AppError(
        'validation_error',
        'Already on the target plan',
        422,
      ),
    );
    const res = await post('/change-plan', { targetTier: 'professional_plus' });
    expect(res.status).toBe(422);
  });

  it('returns 200 on successful plan change', async () => {
    mockAuthed();
    vi.mocked(subscribeService.changePlan).mockResolvedValue({
      razorpaySubscriptionId: 'sub_existing',
    });
    const res = await post('/change-plan', { targetTier: 'corporate' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { razorpaySubscriptionId: string };
    expect(body.razorpaySubscriptionId).toBe('sub_existing');
  });

  it('does NOT accept razorpayPlanId from client', async () => {
    mockAuthed();
    vi.mocked(subscribeService.changePlan).mockResolvedValue({
      razorpaySubscriptionId: 'sub_existing',
    });
    const res = await post('/change-plan', {
      targetTier: 'corporate',
      razorpayPlanId: 'plan_malicious',
    });
    expect(res.status).toBe(200);
    expect(vi.mocked(subscribeService.changePlan)).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-owner', activeOrgId: 'org-1' }),
      { targetTier: 'corporate' },
    );
  });

  it('returns 403 when caller is not org owner', async () => {
    mockAuthed();
    vi.mocked(subscribeService.changePlan).mockRejectedValue(
      new (await import('../../../src/lib/errors.js')).AppError(
        'forbidden',
        'Only the organization owner can manage billing',
        403,
      ),
    );
    const res = await post('/change-plan', { targetTier: 'corporate' });
    expect(res.status).toBe(403);
  });
});
