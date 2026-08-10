import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getServerSession, requireAuth, rolePassesCheck } from '../../src/lib/auth-guard';

const mock = vi.hoisted(() => ({
  headers: vi.fn(),
  redirect: vi.fn().mockImplementation(() => { throw new Error('NEXT_REDIRECT'); }),
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

describe('getServerSession', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mock.headers.mockResolvedValue({
      get: vi.fn((name: string) => (name === 'cookie' ? 'better-auth.session_token=test' : null)),
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        session: { id: 'session-1', token: 'token-1', expiresAt: '2026-06-19T00:00:00.000Z' },
        user: { id: 'user-1', name: 'Mahi', email: 'mahi@test.com', role: 'designer' },
      }),
    }));
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
});
