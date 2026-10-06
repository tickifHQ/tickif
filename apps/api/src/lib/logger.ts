import { getTelemetryConfig } from '@repo/config/telemetry';
import { createServerLogger } from '@repo/logger/server';
import { getTraceContext } from '@repo/telemetry/node';

const settings = getTelemetryConfig();

export const log = createServerLogger({
  service: settings.OTEL_SERVICE_NAME ?? 'tickif-api',
  environment: settings.DEPLOYMENT_ENVIRONMENT,
  version: settings.APP_VERSION,
  level: settings.LOG_LEVEL,
  getTraceContext,
});
