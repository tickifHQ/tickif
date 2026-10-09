import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(path);
  }),
}));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/lib/auth-guard', () => ({ getServerSession: mocks.session }));
import EarlyBirdEntry from '../../../app/(public)/early-bird/page';
beforeEach(() => vi.resetAllMocks());
const open = (plan = 'corporate') => EarlyBirdEntry({ searchParams: Promise.resolve({ plan }) });
describe('early-bird onboarding entry', () => {
  it('retains the offer in the designer login callback', async () => {
    mocks.session.mockResolvedValue(null);
    await expect(open()).rejects.toThrow(
      '/login?mode=designer&callbackURL=%2Fearly-bird%3Fplan%3Dcorporate',
    );
  });
  it('routes a new account through onboarding with its chosen tier', async () => {
    mocks.session.mockResolvedValue({ user: { role: 'visitor', status: 'pending' } });
    await expect(open()).rejects.toThrow('/designer/onboarding?earlyBird=corporate');
  });
  it('takes an existing designer to the claim confirmation', async () => {
    mocks.session.mockResolvedValue({ user: { role: 'designer', status: 'active' } });
    await expect(open('professional_plus')).rejects.toThrow(
      '/designer/early-bird?plan=professional_plus',
    );
  });
  it('keeps active visitor accounts separate and rejects unsupported plans', async () => {
    mocks.session.mockResolvedValue({ user: { role: 'visitor', status: 'active' } });
    await expect(open()).rejects.toThrow('/home/list-your-work');
    await expect(open('hobby')).rejects.toThrow('/#for-designers');
  });
});
