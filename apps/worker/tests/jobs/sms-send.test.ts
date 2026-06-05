import { describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import { processSmsWithSender } from '../../src/jobs/sms-send.js';
import {
  ConsoleSmsSender,
  MissingSmsSender,
  Msg91SmsSender,
  createSmsSender,
  type SmsSender,
} from '../../src/jobs/sms-sender.js';
import type { SmsJob } from '../../src/connection.js';

function fakeJob(data: SmsJob): Job<SmsJob> {
  return { id: 'job-1', data } as Job<SmsJob>;
}

describe('processSms', () => {
  it('sends the OTP through the supplied sender', async () => {
    const sender: SmsSender = {
      send: vi.fn().mockResolvedValue(undefined),
    };

    const result = await processSmsWithSender(
      fakeJob({ phoneNumber: '+919876543210', code: '123456' }),
      sender,
    );

    expect(result).toEqual({ ok: true });
    expect(sender.send).toHaveBeenCalledWith('+919876543210', '123456');
  });
});

describe('createSmsSender', () => {
  it('uses MSG91 when credentials are present', () => {
    const sender = createSmsSender({
      authKey: 'auth-key',
      senderId: 'TICKIF',
      isProduction: false,
    });

    expect(sender).toBeInstanceOf(Msg91SmsSender);
  });

  it('uses console sender outside production without credentials', () => {
    const sender = createSmsSender({
      isProduction: false,
    });

    expect(sender).toBeInstanceOf(ConsoleSmsSender);
  });

  it('fails closed in production without credentials', () => {
    const sender = createSmsSender({
      isProduction: true,
    });

    expect(sender).toBeInstanceOf(MissingSmsSender);
  });
});
