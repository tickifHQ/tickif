import { beforeEach, describe, expect, it, vi } from 'vitest';
const { repository, deliver } = vi.hoisted(() => ({
  repository: { create: vi.fn(), verify: vi.fn(), invalidate: vi.fn() },
  deliver: vi.fn(),
}));
vi.mock('../../../src/modules/whatsapp/repository.js', () => ({
  whatsappRepository: repository,
  hashWhatsappCode: () => 'hashed-code',
}));
vi.mock('@repo/auth/phone-otp', () => ({ sendPhoneOtp: deliver }));
import { whatsappService } from '../../../src/modules/whatsapp/service.js';
const input = { target: 'personal', phoneNumber: '+919800000001' };
beforeEach(() => {
  vi.resetAllMocks();
  repository.create.mockResolvedValue(true);
});
describe('WhatsApp challenge service', () => {
  it('does not deliver when resend is rate limited', async () => {
    repository.create.mockResolvedValue(false);
    await expect(whatsappService.send('user', input)).rejects.toMatchObject({ status: 429 });
    expect(deliver).not.toHaveBeenCalled();
  });
  it('invalidates undeliverable challenges and returns a sanitized error', async () => {
    deliver.mockRejectedValue(new Error('secret'));
    await expect(whatsappService.send('user', input)).rejects.toMatchObject({ status: 502 });
    expect(repository.invalidate).toHaveBeenCalledOnce();
  });
  it('does not issue proof for an invalid code', async () => {
    repository.verify.mockResolvedValue(false);
    await expect(
      whatsappService.verify('user', { ...input, code: '123456', challengeId: 'challenge' }),
    ).rejects.toMatchObject({ status: 422 });
  });
});
