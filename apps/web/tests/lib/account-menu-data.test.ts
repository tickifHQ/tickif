import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchAccountActivity,
  fetchAccountAddress,
  maskedAccountPhone,
} from '@/lib/account-menu-data';
const mock = vi.hoisted(() => ({ saved: vi.fn(), enquiries: vi.fn(), account: vi.fn() }));
vi.mock('@/lib/api', () => ({
  api: {
    api: {
      'saved-projects': { $get: mock.saved },
      enquiries: { mine: { $get: mock.enquiries } },
      'personal-account': { me: { $get: mock.account } },
    },
  },
}));

beforeEach(() => vi.resetAllMocks());
describe('account menu data', () => {
  it('masks valid phone numbers without exposing generated email identities', () => {
    expect(maskedAccountPhone('+919876543210')).toBe('+91 98765 •••10');
    expect(maskedAccountPhone('+14155552671')).toBe('+1 41555 •••71');
    for (const input of [null, '', '911@phone.tickif.local', '123', 'not a phone'])
      expect(maskedAccountPhone(input)).toBeNull();
  });

  it('validates both counts and forwards cancellation without caching personal data', async () => {
    mock.saved.mockResolvedValue(
      Response.json({ projects: [], page: 1, limit: 1, total: 24, totalPages: 24 }),
    );
    mock.enquiries.mockResolvedValue(
      Response.json({ items: [], page: 1, limit: 1, total: 3, totalPages: 3 }),
    );
    const signal = new AbortController().signal;
    expect(await fetchAccountActivity(signal)).toEqual({ saved: 24, enquiries: 3 });
    expect(mock.saved).toHaveBeenCalledWith(
      { query: { page: 1, limit: 1 } },
      { init: { cache: 'no-store', signal } },
    );
  });

  it.each(['http', 'invalid', 'network'])(
    'does not turn a failed count into zero: %s',
    async (failure) => {
      mock.saved.mockResolvedValue(
        Response.json({ projects: [], page: 1, limit: 1, total: 2, totalPages: 2 }),
      );
      if (failure === 'network') mock.enquiries.mockRejectedValue(new Error('offline'));
      else
        mock.enquiries.mockResolvedValue(
          failure === 'http' ? new Response('', { status: 503 }) : Response.json({ total: -1 }),
        );
      expect(await fetchAccountActivity(new AbortController().signal)).toEqual({
        saved: 2,
        enquiries: null,
      });
    },
  );

  it('rejects malformed personal-account responses', async () => {
    mock.account.mockResolvedValue(Response.json({ address: 'Untrusted shape' }));
    await expect(fetchAccountAddress(new AbortController().signal)).rejects.toThrow(
      'Could not load account details.',
    );
  });
});
