import 'server-only';
import { getTelemetryConfig } from '@repo/config/telemetry';
import { createServerLogger, type Logger } from '@repo/logger/server';
import { getTraceContext } from '@repo/telemetry/node';

let logger: Logger | undefined;

export function getServerLogger(): Logger {
  if (logger) return logger;
  const config = getTelemetryConfig();
  logger = createServerLogger({
    service: config.OTEL_SERVICE_NAME ?? 'tickif-web',
    environment: config.DEPLOYMENT_ENVIRONMENT,
    version: config.APP_VERSION,
    level: config.LOG_LEVEL,
    getTraceContext,
  });
  return logger;
}
