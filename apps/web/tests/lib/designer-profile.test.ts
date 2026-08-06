import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  getCompletion: vi.fn(),
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
        me: { $get: mock.getProfile, completion: { $get: mock.getCompletion } },
      },
    },
  },
}));

const { getProfileCompletion, requireCurrentDesignerProfile } = await import(
  '../../src/lib/designer-profile'
);

describe('requireCurrentDesignerProfile', () => {
  beforeEach(() => {
    mock.headers.mockResolvedValue({
      get: vi.fn((name: string) => (name === 'cookie' ? 'better-auth.session_token=test' : null)),
    });
    mock.redirect.mockClear();
    mock.getProfile.mockReset();
    mock.getCompletion.mockReset();
  });

  it('redirects requests without a session cookie to login', async () => {
    mock.headers.mockResolvedValue({ get: vi.fn(() => null) });

    await expect(requireCurrentDesignerProfile()).rejects.toThrow('NEXT_REDIRECT');
    expect(mock.redirect).toHaveBeenCalledWith('/login');
    expect(mock.getProfile).not.toHaveBeenCalled();
  });

  it('redirects an authenticated user without an active organization to studio selection', async () => {
    mock.getProfile.mockResolvedValue({ ok: false, status: 422 });

    await expect(requireCurrentDesignerProfile()).rejects.toThrow('NEXT_REDIRECT');
    expect(mock.redirect).toHaveBeenCalledWith('/designer/select-studio');
  });

  it('keeps genuine profile authorization failures on the unauthorized page', async () => {
    mock.getProfile.mockResolvedValue({ ok: false, status: 403 });

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

  it('loads and validates profile completion through the shared server helper', async () => {
    const completion = { steps: [], score: 75, missing: ['Publish a project'] };
    mock.getCompletion.mockResolvedValue(
      new Response(JSON.stringify(completion), { status: 200 }),
    );

    await expect(getProfileCompletion()).resolves.toEqual({ ok: true, data: completion });
    expect(mock.getCompletion).toHaveBeenCalledWith(
      {},
      { headers: { cookie: 'better-auth.session_token=test' } },
    );
  });
});
