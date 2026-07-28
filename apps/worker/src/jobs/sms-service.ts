import type { SmsSender } from './sms-sender.js';

/**
 * Owns SMS delivery. Receives its provider strategy via the constructor and is
 * built in the worker entrypoint (not at import time), so provider selection lives
 * in one place and the worker handler is a thin `service.send(job.data)` adapter.
 */
export class SmsService {
  constructor(private readonly sender: SmsSender) {}

  async send(job: unknown): Promise<void> {
    if (!job || typeof job !== 'object') {
      throw new Error('Invalid SMS queue payload');
    }

    const payload = job as Record<string, unknown>;
    if (
      payload.kind === 'booking-requested' &&
      typeof payload.phoneNumber === 'string' &&
      typeof payload.bookingId === 'string' &&
      typeof payload.requesterName === 'string'
    ) {
      await this.sender.sendBookingRequested(
        payload.phoneNumber,
        payload.bookingId,
        payload.requesterName,
      );
      return;
    }

    if (
      (payload.kind === 'otp' || payload.kind === undefined) &&
      typeof payload.phoneNumber === 'string' &&
      typeof payload.code === 'string'
    ) {
      await this.sender.send(payload.phoneNumber, payload.code);
      return;
    }

    throw new Error('Invalid SMS queue payload');
  }
}
