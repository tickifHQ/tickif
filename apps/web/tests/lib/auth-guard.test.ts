import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activeContextForSession,
  getServerSession,
  requireActiveVisitor,
  requireAuth,
  rolePassesCheck,
} from '../../src/lib/auth-guard';

const mock = vi.hoisted(() => ({
  headers: vi.fn(),
  redirect: vi.fn().mockImplementation(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

vi.mock('next/headers', () => ({
  headers: mock.headers,
}));

vi.mock('next/navigation', () => ({
  redirect: mock.redirect,
}));

describe('rolePassesCheck', () => {
  it.each([
    // superadmin passes every check
    ['superadmin', 'superadmin', true],
    ['superadmin', 'admin', true],
    ['superadmin', 'designer', true],
    // admin passes admin + designer, not superadmin
    ['admin', 'admin', true],
    ['admin', 'designer', true],
    ['admin', 'superadmin', false],
    // designer passes designer only
    ['designer', 'designer', true],
    ['designer', 'admin', false],
    ['designer', 'superadmin', false],
    // unknown role never passes
    ['bogus', 'designer', false],
  ] as const)('role %s vs required %s → %s', (userRole, requiredRole, expected) => {
    expect(rolePassesCheck(userRole, requiredRole)).toBe(expected);
  });

  it('null role fails every check', () => {
    expect(rolePassesCheck(null, 'designer')).toBe(false);
    expect(rolePassesCheck(null, 'admin')).toBe(false);
    expect(rolePassesCheck(null, 'superadmin')).toBe(false);
  });
});

describe('activeContextForSession', () => {
  const user = { id: 'user-1', name: 'Mahi', email: 'mahi@test.com', role: 'designer' };

  it('treats null organization and branch ids as personal context', () => {
    expect(
      activeContextForSession({
        session: { id: 'session-1', token: 'token-1', expiresAt: '2026-06-19T00:00:00Z' },
        user,
      }),
    ).toEqual({ kind: 'personal' });
  });

  it('returns the complete organization and branch context', () => {
    expect(
      activeContextForSession({
        session: {
          id: 'session-1',
          token: 'token-1',
          expiresAt: '2026-06-19T00:00:00Z',
          activeOrganizationId: 'org-1',
          activeTeamId: 'team-1',
        },
        user,
      }),
    ).toEqual({ kind: 'organization', organizationId: 'org-1', teamId: 'team-1' });
  });

  it('returns organization roll-up context when no branch is selected', () => {
    expect(
      activeContextForSession({
        session: {
          id: 'session-1',
          token: 'token-1',
          expiresAt: '2026-06-19T00:00:00Z',
          activeOrganizationId: 'org-1',
          activeTeamId: null,
        },
        user,
      }),
    ).toEqual({ kind: 'organization', organizationId: 'org-1', teamId: null });
  });
});

describe('getServerSession', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mock.redirect.mockClear();
    mock.headers.mockResolvedValue({
      get: vi.fn((name: string) => (name === 'cookie' ? 'better-auth.session_token=test' : null)),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          session: { id: 'session-1', token: 'token-1', expiresAt: '2026-06-19T00:00:00.000Z' },
          user: { id: 'user-1', name: 'Mahi', email: 'mahi@test.com', role: 'designer' },
        }),
      }),
    );
  });

  it('can bypass better-auth cookie cache for fresh role reads', async () => {
    await getServerSession({ disableCookieCache: true });

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8008/api/auth/get-session?disableCookieCache=true',
      {
        headers: { cookie: 'better-auth.session_token=test' },
        cache: 'no-store',
      },
    );
  });

  it('bypasses cookie cache when requireAuth performs a role check', async () => {
    await requireAuth({ requiredRole: 'designer' });

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8008/api/auth/get-session?disableCookieCache=true',
      {
        headers: { cookie: 'better-auth.session_token=test' },
        cache: 'no-store',
      },
    );
    expect(mock.redirect).not.toHaveBeenCalled();
  });

  it('bypasses cookie cache for requireAuth even without a role check', async () => {
    // requireAuth gates a protected layout, so a revoked session must bite immediately
    // rather than keep rendering it until the cached session_data blob expires.
    await requireAuth();

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8008/api/auth/get-session?disableCookieCache=true',
      {
        headers: { cookie: 'better-auth.session_token=test' },
        cache: 'no-store',
      },
    );
  });

  it('redirects to /login when session is null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    await expect(requireAuth()).rejects.toThrow('NEXT_REDIRECT');
    expect(mock.redirect).toHaveBeenCalledWith('/login');
  });

  it('redirects to /unauthorized when role is insufficient', async () => {
    await expect(requireAuth({ requiredRole: 'superadmin' })).rejects.toThrow('NEXT_REDIRECT');
    expect(mock.redirect).toHaveBeenCalledWith('/unauthorized');
  });

  it.each(['visitor', null])(
    'gives an unfinished %s account a path to finish designer setup',
    async (role) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            session: { id: 'session-1', token: 'token-1', expiresAt: '2026-06-19T00:00:00.000Z' },
            user: { id: 'user-1', name: 'Mahi', email: 'mahi@test.com', role },
          }),
        }),
      );

      await expect(requireAuth({ requiredRole: 'designer' })).rejects.toThrow('NEXT_REDIRECT');
      expect(mock.redirect).toHaveBeenCalledWith('/designer/onboarding/deferred');
    },
  );

  it.each(['visitor', null, 'unknown'])('keeps %s accounts out of admin pages', async (role) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          session: { id: 'session-1', token: 'token-1', expiresAt: '2026-06-19T00:00:00.000Z' },
          user: { id: 'user-1', name: 'Mahi', email: 'mahi@test.com', role },
        }),
      }),
    );

    await expect(requireAuth({ requiredRole: 'admin' })).rejects.toThrow('NEXT_REDIRECT');
    expect(mock.redirect).toHaveBeenCalledWith('/unauthorized');
  });

  it('does not treat unknown roles as unfinished designer accounts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          session: { id: 'session-1', token: 'token-1', expiresAt: '2026-06-19T00:00:00.000Z' },
          user: { id: 'user-1', name: 'Mahi', email: 'mahi@test.com', role: 'unknown' },
        }),
      }),
    );

    await expect(requireAuth({ requiredRole: 'designer' })).rejects.toThrow('NEXT_REDIRECT');
    expect(mock.redirect).toHaveBeenCalledWith('/unauthorized');
  });

  it('checks the active context separately from the platform role', async () => {
    mock.redirect.mockClear();
    await requireAuth({ requiredRole: 'designer', requiredContext: 'personal' });
    expect(mock.redirect).not.toHaveBeenCalled();

    await expect(
      requireAuth({ requiredRole: 'designer', requiredContext: 'organization' }),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(mock.redirect).toHaveBeenCalledWith('/unauthorized');
  });

  it('allows only active visitors into My Tickif', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          session: { id: 'session-1', token: 'token-1', expiresAt: '2026-06-19T00:00:00.000Z' },
          user: {
            id: 'visitor-1',
            name: 'Visitor',
            email: 'visitor@test.com',
            role: 'visitor',
            status: 'active',
          },
        }),
      }),
    );

    await expect(requireActiveVisitor()).resolves.toMatchObject({
      user: { role: 'visitor', status: 'active' },
    });
    expect(mock.redirect).not.toHaveBeenCalled();
  });

  it.each([
    ['designer', 'active', '/designer/dashboard'],
    ['admin', 'active', '/dashboard'],
    ['superadmin', 'active', '/dashboard'],
    ['visitor', 'pending', '/onboarding'],
    ['visitor', 'suspended', '/unauthorized'],
  ] as const)('redirects a %s/%s account away from My Tickif', async (role, status, path) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          session: { id: 'session-1', token: 'token-1', expiresAt: '2026-06-19T00:00:00.000Z' },
          user: { id: 'user-1', name: 'User', email: 'user@test.com', role, status },
        }),
      }),
    );

    await expect(requireActiveVisitor()).rejects.toThrow('NEXT_REDIRECT');
    expect(mock.redirect).toHaveBeenCalledWith(path);
  });

  it('rejects a visitor carrying organization context', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          session: {
            id: 'session-1',
            token: 'token-1',
            expiresAt: '2026-06-19T00:00:00.000Z',
            activeOrganizationId: 'org-1',
          },
          user: {
            id: 'visitor-1',
            name: 'Visitor',
            email: 'visitor@test.com',
            role: 'visitor',
            status: 'active',
          },
        }),
      }),
    );

    await expect(requireActiveVisitor()).rejects.toThrow('NEXT_REDIRECT');
    expect(mock.redirect).toHaveBeenCalledWith('/unauthorized');
  });
});
