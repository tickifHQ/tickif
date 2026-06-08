import type { SmsJob } from '../connection.js';
import type { SmsSender } from './sms-sender.js';

/**
 * Owns OTP SMS delivery. Receives its provider strategy via the constructor and is
 * built in the worker entrypoint (not at import time), so provider selection lives
 * in one place and the worker handler is a thin `service.send(job.data)` adapter.
 */
export class SmsService {
  constructor(private readonly sender: SmsSender) {}

  async send(job: SmsJob): Promise<void> {
    await this.sender.send(job.phoneNumber, job.code);
  }
}
