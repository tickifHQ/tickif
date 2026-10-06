import { initializeBrowserTelemetry } from './src/lib/logger.browser';

// Synchronous listeners catch hydration failures; initialization performs no I/O.
initializeBrowserTelemetry();
