import { initTelemetry } from '@repo/telemetry/node';

export function registerNodeTelemetry(): void {
  initTelemetry({ service: 'tickif-web', instrumentation: 'none' });
}
