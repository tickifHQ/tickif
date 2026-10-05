import { initTelemetry, shutdownTelemetry } from './telemetry.js';

// Instrument dependencies before the bundled runtime imports BullMQ, HTTP clients or pg.
initTelemetry({ service: 'tickif-worker', instrumentation: 'dependencies' });

try {
  await import('./runtime.js');
} catch (err) {
  const { logger } = await import('./observability/logger.js');
  logger.fatal({ event: 'worker.startup_failed', err }, 'Worker startup failed');
  await logger.flush();
  await shutdownTelemetry(3_000);
  process.exit(1);
}
