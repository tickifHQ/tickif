import { describe, expect, it, vi } from 'vitest';
import { SmsService } from '../../src/jobs/sms-service.js';
import {
  ConsoleSmsSender,
  MissingSmsSender,
  Msg91SmsSender,
  selectSmsSender,
  type SmsSender,
} from '../../src/jobs/sms-sender.js';

describe('SmsService', () => {
  it('sends the OTP through its injected sender', async () => {
    const sender: SmsSender = { send: vi.fn().mockResolvedValue(undefined) };
    const service = new SmsService(sender);

    await service.send({ phoneNumber: '919876543210', code: '123456' });

    expect(sender.send).toHaveBeenCalledWith('919876543210', '123456');
  });
});

describe('selectSmsSender', () => {
  it('uses MSG91 when provider=msg91 and creds are present', () => {
    const sender = selectSmsSender({
      provider: 'msg91',
      authKey: 'auth-key',
      senderId: 'TICKIF',
      isProduction: false,
    });
    expect(sender).toBeInstanceOf(Msg91SmsSender);
  });

  it('falls back to the console sender in dev when msg91 creds are missing', () => {
    expect(selectSmsSender({ provider: 'msg91', isProduction: false })).toBeInstanceOf(
      ConsoleSmsSender,
    );
  });

  it('fails closed in production when msg91 creds are missing', () => {
    expect(selectSmsSender({ provider: 'msg91', isProduction: true })).toBeInstanceOf(
      MissingSmsSender,
    );
  });

  it('uses the console sender for provider=console in dev', () => {
    expect(selectSmsSender({ provider: 'console', isProduction: false })).toBeInstanceOf(
      ConsoleSmsSender,
    );
  });

  it('fails closed for provider=console in production', () => {
    expect(selectSmsSender({ provider: 'console', isProduction: true })).toBeInstanceOf(
      MissingSmsSender,
    );
  });
});
