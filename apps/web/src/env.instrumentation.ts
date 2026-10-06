import type { Instrumentation } from 'next';

/**
 * Framework environment boundary. Next requires the literal NEXT_RUNTIME check
 * to remove Node-only imports from its Edge instrumentation graph. An imported
 * typed boolean does not prune those imports in Turbopack. Application settings
 * remain validated by @repo/config/telemetry; browser env never imports this file.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerNodeTelemetry } = await import('../instrumentation.node');
    registerNodeTelemetry();
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getServerLogger } = await import('./lib/logger.server');
    getServerLogger().error({
      event: 'web.request.error',
      error,
      method: request.method,
      route: context.routePath,
      routeType: context.routeType,
      ...(typeof error === 'object' && error !== null && 'digest' in error && typeof error.digest === 'string'
        ? { errorCode: error.digest }
        : {}),
    }, 'Next.js request failed');
  }
};
