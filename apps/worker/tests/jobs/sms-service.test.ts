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
const novuSuccess = () =>
  new Response(
    JSON.stringify({
      acknowledged: true,
      status: 'processed',
      transactionId: 'transaction-1',
    }),
    { status: 201 },
  );

describe('SmsService', () => {
  it('sends the OTP through its injected sender', async () => {
    const sender: SmsSender = {
      send: vi.fn().mockResolvedValue(undefined),
      sendBookingRequested: vi.fn().mockResolvedValue(undefined),
    };
    const service = new SmsService(sender);

    await service.send({ phoneNumber: '919876543210', code: '123456' });

    expect(sender.send).toHaveBeenCalledWith('919876543210', '123456');
    expect(sender.sendBookingRequested).not.toHaveBeenCalled();
  });

  it('sends a booking-requested notification without treating it as an OTP', async () => {
    const sender: SmsSender = {
      send: vi.fn().mockResolvedValue(undefined),
      sendBookingRequested: vi.fn().mockResolvedValue(undefined),
    };
    const service = new SmsService(sender);

    await service.send({
      kind: 'booking-requested',
      phoneNumber: '919876543210',
      bookingId: 'booking-123',
      requesterName: 'Aarav Shah',
    });

    expect(sender.sendBookingRequested).toHaveBeenCalledWith(
      '919876543210',
      'booking-123',
      'Aarav Shah',
    );
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('rejects malformed or unknown SMS queue payloads', async () => {
    const sender: SmsSender = {
      send: vi.fn().mockResolvedValue(undefined),
      sendBookingRequested: vi.fn().mockResolvedValue(undefined),
    };
    const service = new SmsService(sender);

    await expect(service.send({ kind: 'unexpected', phoneNumber: '919876543210' })).rejects.toThrow(
      'Invalid SMS queue payload',
    );
    expect(sender.send).not.toHaveBeenCalled();
    expect(sender.sendBookingRequested).not.toHaveBeenCalled();
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

  it('passes the booking workflow through the Novu provider selection', async () => {
    const fetchMock = vi.fn().mockResolvedValue(novuSuccess());
    vi.stubGlobal('fetch', fetchMock);
    const sender = selectSmsSender({
      provider: 'novu',
      novuSecretKey: 'novu-secret',
      novuWorkflowId: 'phone-otp',
      novuBookingWorkflowId: 'booking-requested',
      novuApiUrl,
      isProduction: false,
    });

    await sender.sendBookingRequested('919876543210', 'booking-123', 'Aarav Shah');

    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(String(init?.body))).toMatchObject({
      name: 'booking-requested',
      payload: { bookingId: 'booking-123', requesterName: 'Aarav Shah' },
      transactionId: 'booking-requested:booking-123',
    });
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
    const fetchMock = vi.fn().mockResolvedValue(novuSuccess());
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

  it('triggers the booking workflow with booking context and no OTP payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(novuSuccess());
    vi.stubGlobal('fetch', fetchMock);

    const sender = new NovuSmsSender(
      'novu-secret',
      'phone-otp',
      novuApiUrl,
      'booking-requested',
    );
    await sender.sendBookingRequested('919876543210', 'booking-123', 'Aarav Shah');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://api.novu.co/v1/events/trigger');
    expect(init?.headers).toMatchObject({
      'idempotency-key': 'booking-requested:booking-123',
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      name: 'booking-requested',
      to: {
        subscriberId: 'phone:919876543210',
        phone: '+919876543210',
      },
      payload: {
        bookingId: 'booking-123',
        requesterName: 'Aarav Shah',
      },
      transactionId: 'booking-requested:booking-123',
    });
  });

  it('throws when Novu acknowledges the request without processing it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            acknowledged: false,
            status: 'trigger_not_active',
            transactionId: 'transaction-1',
          }),
          { status: 201 },
        ),
      ),
    );
    const sender = new NovuSmsSender('novu-secret', 'phone-otp', novuApiUrl);

    await expect(sender.send('919876543210', '123456')).rejects.toThrow(
      'Novu SMS trigger was not processed: trigger_not_active',
    );
  });

  it('fails clearly when the booking workflow is not configured', async () => {
    const sender = new NovuSmsSender('novu-secret', 'phone-otp', novuApiUrl);

    await expect(
      sender.sendBookingRequested('919876543210', 'booking-123', 'Aarav Shah'),
    ).rejects.toThrow('Novu booking SMS workflow is not configured');
  });
});
