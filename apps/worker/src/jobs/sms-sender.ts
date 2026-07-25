import type { Config } from '@repo/config';

const NOVU_TIMEOUT_MS = 10_000;

/** A delivery strategy. Phone numbers arrive already normalized to digits (see @repo/queue). */
export type SmsSender = {
  send(phoneNumber: string, code: string): Promise<void>;
  sendBookingRequested(
    phoneNumber: string,
    bookingId: string,
    requesterName: string,
  ): Promise<void>;
};

/** Dev/local only: logs the code instead of sending. Never selected in production. */
export class ConsoleSmsSender implements SmsSender {
  async send(phoneNumber: string, code: string): Promise<void> {
    console.log(`[sms] OTP for ${phoneNumber}: ${code}`);
  }

  async sendBookingRequested(
    phoneNumber: string,
    bookingId: string,
    requesterName: string,
  ): Promise<void> {
    console.log(
      `[sms] Booking ${bookingId} requested for ${phoneNumber} by ${requesterName}`,
    );
  }
}

/** Fail-closed: selected in production when the chosen provider has no credentials. */
export class MissingSmsSender implements SmsSender {
  async send(): Promise<void> {
    throw new Error('SMS provider is not configured (missing credentials in production)');
  }

  async sendBookingRequested(): Promise<void> {
    throw new Error('SMS provider is not configured (missing credentials in production)');
  }
}

export class NovuSmsSender implements SmsSender {
  constructor(
    private readonly secretKey: string,
    private readonly workflowId: string,
    private readonly apiUrl: string,
    private readonly bookingWorkflowId?: string,
  ) {}

  async send(phoneNumber: string, code: string): Promise<void> {
    await this.triggerWorkflow(phoneNumber, this.workflowId, { code });
  }

  async sendBookingRequested(
    phoneNumber: string,
    bookingId: string,
    requesterName: string,
  ): Promise<void> {
    if (!this.bookingWorkflowId) {
      throw new Error('Novu booking SMS workflow is not configured');
    }
    await this.triggerWorkflow(phoneNumber, this.bookingWorkflowId, {
      bookingId,
      requesterName,
    }, `booking-requested:${bookingId}`);
  }

  private async triggerWorkflow(
    phoneNumber: string,
    workflowId: string,
    payload: Record<string, string>,
    transactionId?: string,
  ): Promise<void> {
    const endpoint = new URL('/v1/events/trigger', this.apiUrl);
    const e164Phone = `+${phoneNumber}`;
    const body = {
      name: workflowId,
      to: {
        subscriberId: `phone:${phoneNumber}`,
        phone: e164Phone,
      },
      payload,
      ...(transactionId ? { transactionId } : {}),
    };

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          authorization: `ApiKey ${this.secretKey}`,
          'content-type': 'application/json',
          ...(transactionId ? { 'idempotency-key': transactionId } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(NOVU_TIMEOUT_MS),
      });
    } catch (err) {
      throw new Error(`Novu SMS trigger failed: ${(err as Error).message}`);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `Novu SMS trigger failed with status ${response.status}: ${text.slice(0, 200)}`,
      );
    }

    let result: unknown;
    try {
      result = await response.json();
    } catch {
      throw new Error('Novu SMS trigger returned an invalid response');
    }
    if (
      !result ||
      typeof result !== 'object' ||
      (result as Record<string, unknown>).acknowledged !== true ||
      (result as Record<string, unknown>).status !== 'processed'
    ) {
      const status =
        result && typeof result === 'object'
          ? String((result as Record<string, unknown>).status ?? 'unknown')
          : 'unknown';
      throw new Error(`Novu SMS trigger was not processed: ${status}`);
    }
  }
}

export type SmsProvider = Config['SMS_PROVIDER'];

export type SelectSmsSenderOptions = {
  provider: SmsProvider;
  novuSecretKey?: string;
  novuWorkflowId?: string;
  novuBookingWorkflowId?: string;
  novuApiUrl: string;
  isProduction: boolean;
};

/**
 * Explicit, config-driven provider selection. Each provider is a self-contained
 * `SmsSender` strategy, so adding one later (Twilio, Plivo, …) is a new `case`
 * here rather than a refactor. When the selected provider has no credentials it
 * falls back to the console sender in dev and fails closed in production.
 */
export function selectSmsSender(options: SelectSmsSenderOptions): SmsSender {
  switch (options.provider) {
    case 'console':
      // Console must never deliver in production (it would log the OTP) — fail closed.
      return options.isProduction ? new MissingSmsSender() : new ConsoleSmsSender();
    case 'novu':
      return options.novuSecretKey && options.novuWorkflowId
        ? new NovuSmsSender(
            options.novuSecretKey,
            options.novuWorkflowId,
            options.novuApiUrl,
            options.novuBookingWorkflowId,
          )
        : options.isProduction
          ? new MissingSmsSender()
          : new ConsoleSmsSender();
  }
  // Exhaustive over SmsProvider — this guards any new enum value at compile time.
  const unreachable: never = options.provider;
  throw new Error(`Unsupported SMS provider: ${String(unreachable)}`);
}
