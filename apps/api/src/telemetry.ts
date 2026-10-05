import { initTelemetry } from '@repo/telemetry/node';

// Preloaded by Node before server.js imports auth, repositories, or queue clients.
// Hono owns incoming spans; automatic instrumentation covers dependencies only.
initTelemetry({ service: 'tickif-api', instrumentation: 'dependencies' });
