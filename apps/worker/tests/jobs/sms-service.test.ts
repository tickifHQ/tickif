import { describe, expect, it, vi } from 'vitest';
import { SmsService } from '../../src/jobs/sms-service.js';
import {
  ConsoleSmsSender,
  MissingSmsSender,
  NovuSmsSender,
  selectSmsSender,
  type SmsSender,
} from '../../src/jobs/sms-sender.js';

const novuApiUrl = 'https://api.novu.co';

describe('SmsService', () => {
  it('sends the OTP through its injected sender', async () => {
    const sender: SmsSender = { send: vi.fn().mockResolvedValue(undefined) };
    const service = new SmsService(sender);

    await service.send({ phoneNumber: '919876543210', code: '123456' });

    expect(sender.send).toHaveBeenCalledWith('919876543210', '123456');
  });
});

describe('selectSmsSender', () => {
  it('uses the console sender for provider=console in dev', () => {
    expect(selectSmsSender({ provider: 'console', novuApiUrl, isProduction: false })).toBeInstanceOf(
      ConsoleSmsSender,
    );
  });

  it('fails closed for provider=console in production', () => {
    expect(selectSmsSender({ provider: 'console', novuApiUrl, isProduction: true })).toBeInstanceOf(
      MissingSmsSender,
    );
  });

  it('uses Novu when provider=novu and creds are present', () => {
    const sender = selectSmsSender({
      provider: 'novu',
      novuSecretKey: 'novu-secret',
      novuWorkflowId: 'phone-otp',
      novuApiUrl,
      isProduction: false,
    });
    expect(sender).toBeInstanceOf(NovuSmsSender);
  });

  it('falls back to the console sender in dev when Novu creds are missing', () => {
    expect(selectSmsSender({ provider: 'novu', novuApiUrl, isProduction: false })).toBeInstanceOf(
      ConsoleSmsSender,
    );
  });

  it('fails closed in production when Novu creds are missing', () => {
    expect(selectSmsSender({ provider: 'novu', novuApiUrl, isProduction: true })).toBeInstanceOf(
      MissingSmsSender,
    );
  });
});

describe('NovuSmsSender', () => {
  it('triggers the configured Novu workflow with the subscriber phone and code payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const sender = new NovuSmsSender('novu-secret', 'phone-otp', novuApiUrl);
    await sender.send('919876543210', '123456');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://api.novu.co/v1/events/trigger');
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        authorization: 'ApiKey novu-secret',
        'content-type': 'application/json',
      },
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      name: 'phone-otp',
      to: {
        subscriberId: 'phone:919876543210',
        phone: '+919876543210',
      },
      payload: {
        code: '123456',
      },
    });
  });

  it('throws on a rejected Novu trigger so BullMQ retries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('bad workflow', { status: 404 })),
    );

    const sender = new NovuSmsSender('novu-secret', 'missing-workflow', novuApiUrl);
    await expect(sender.send('919876543210', '123456')).rejects.toThrow(
      'Novu SMS trigger failed with status 404',
    );
  });
});
