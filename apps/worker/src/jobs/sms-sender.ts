import { getTelemetryConfig } from '@repo/config/telemetry';


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
    assertLocalConsoleDelivery();
    console.log(`[sms] OTP for ${phoneNumber}: ${code}`);
  }

  async sendBookingRequested(
    phoneNumber: string,
    bookingId: string,
    requesterName: string,
  ): Promise<void> {
    assertLocalConsoleDelivery();
    console.log(`[sms] Booking ${bookingId} requested for ${phoneNumber} by ${requesterName}`);
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

function assertLocalConsoleDelivery(): void {
  const settings = getTelemetryConfig();
  if (settings.NODE_ENV === 'production' || settings.TELEMETRY_ENABLED) {
    throw new Error('Console SMS delivery requires a local environment with telemetry disabled');
  }
}

/** Legacy queue is local-only. Real OTPs are sent directly through MSG91. */
export function selectSmsSender(options: { isProduction: boolean }): SmsSender {
  return options.isProduction ? new MissingSmsSender() : new ConsoleSmsSender();
}
