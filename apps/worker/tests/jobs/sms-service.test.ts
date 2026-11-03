import { afterEach, describe, expect, it, vi } from 'vitest';
import { SmsService } from '../../src/jobs/sms-service.js';
import {
  ConsoleSmsSender,
  MissingSmsSender,
  selectSmsSender,
  type SmsSender,
} from '../../src/jobs/sms-sender.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('local console delivery privacy', () => {
  it('keeps local OTP output available with telemetry disabled', async () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await new ConsoleSmsSender().send('919876543210', '123456');
      expect(output).toHaveBeenCalledWith('[sms] OTP for 919876543210: 123456');
    } finally {
      output.mockRestore();
    }
  });

  it('refuses OTP console output when telemetry export is enabled', async () => {
    vi.stubEnv('TELEMETRY_ENABLED', 'true');
    vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://127.0.0.1:4318');
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await expect(new ConsoleSmsSender().send('919876543210', '123456')).rejects.toThrow(
        'telemetry disabled',
      );
      expect(output).not.toHaveBeenCalled();
    } finally {
      output.mockRestore();
    }
  });
});

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

describe('legacy local delivery selection', () => {
  it('never logs production OTPs', () => expect(selectSmsSender({ isProduction: true })).toBeInstanceOf(MissingSmsSender));
  it('keeps isolated local fixtures working', () => expect(selectSmsSender({ isProduction: false })).toBeInstanceOf(ConsoleSmsSender));
});
