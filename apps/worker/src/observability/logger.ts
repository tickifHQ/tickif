import { createHash } from 'node:crypto';
import { getTelemetryConfig } from '@repo/config/telemetry';
import { createServerLogger } from '@repo/logger/server';
import { getTraceContext } from '@repo/telemetry/node';

const config = getTelemetryConfig();

export const logger = createServerLogger({
  service: config.OTEL_SERVICE_NAME ?? 'tickif-worker',
  environment: config.DEPLOYMENT_ENVIRONMENT,
  version: config.APP_VERSION,
  level: config.LOG_LEVEL,
  getTraceContext,
});

/** Queue IDs can embed phone numbers. Never expose them through logs or metrics. */
export function safeJobKey(id: string | undefined): string | undefined {
  return id ? createHash('sha256').update(id).digest('hex').slice(0, 24) : undefined;
}
