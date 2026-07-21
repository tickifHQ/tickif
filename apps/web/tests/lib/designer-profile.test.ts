import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  headers: vi.fn(),
  redirect: vi.fn().mockImplementation(() => {
    throw new Error('NEXT_REDIRECT');
  }),
  getProfile: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: mock.headers }));
vi.mock('next/navigation', () => ({ redirect: mock.redirect }));
vi.mock('@/lib/api', () => ({
  api: {
    api: {
      profiles: {
        me: { $get: mock.getProfile },
      },
    },
  },
}));

const { requireCurrentDesignerProfile } = await import('../../src/lib/designer-profile');

describe('requireCurrentDesignerProfile', () => {
  beforeEach(() => {
    mock.headers.mockResolvedValue({
      get: vi.fn((name: string) => (name === 'cookie' ? 'better-auth.session_token=test' : null)),
    });
    mock.redirect.mockClear();
    mock.getProfile.mockReset();
  });

  it('redirects requests without a session cookie to login', async () => {
    mock.headers.mockResolvedValue({ get: vi.fn(() => null) });

    await expect(requireCurrentDesignerProfile()).rejects.toThrow('NEXT_REDIRECT');
    expect(mock.redirect).toHaveBeenCalledWith('/login');
    expect(mock.getProfile).not.toHaveBeenCalled();
  });

  it('redirects an authenticated user without an active designer membership', async () => {
    mock.getProfile.mockResolvedValue({ ok: false, status: 422 });

    await expect(requireCurrentDesignerProfile()).rejects.toThrow('NEXT_REDIRECT');
    expect(mock.redirect).toHaveBeenCalledWith('/unauthorized');
  });

  it('surfaces service failures instead of misreporting them as authorization failures', async () => {
    mock.getProfile.mockResolvedValue({ ok: false, status: 500 });

    await expect(requireCurrentDesignerProfile()).rejects.toThrow(
      'Unable to load the active designer organization',
    );
    expect(mock.redirect).not.toHaveBeenCalled();
  });
});
