import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/modules/personal-account/repository.js', () => ({
  personalAccountRepository: { access: vi.fn() },
}));
const { personalAccountRepository } =
  await import('../../../src/modules/personal-account/repository.js');
const { personalAccountService } = await import('../../../src/modules/personal-account/service.js');

beforeEach(() => vi.clearAllMocks());
describe('personal account service', () => {
  it('returns only the persisted personal account', async () => {
    const account = {
      name: 'Test Name',
      address: null,
      whatsappNumber: null,
      email: 'test@example.com',
      emailVerified: true,
      phoneNumber: null,
      phoneNumberVerified: false,
      revision: 'a'.repeat(64),
    };
    vi.mocked(personalAccountRepository.access).mockResolvedValue({ kind: 'ok', account });
    await expect(personalAccountService.access('user', 'session')).resolves.toEqual(account);
    expect(personalAccountRepository.access).toHaveBeenCalledWith('user', 'session', undefined);
  });
  it.each([
    ['forbidden', 403],
    ['conflict', 409],
  ] as const)('maps %s to an actionable error', async (kind, status) => {
    vi.mocked(personalAccountRepository.access).mockResolvedValue({ kind });
    await expect(personalAccountService.access('user', 'session')).rejects.toMatchObject({
      status,
    });
  });
});
