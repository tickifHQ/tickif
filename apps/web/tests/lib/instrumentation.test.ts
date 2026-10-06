import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Instrumentation } from 'next';

const spies = vi.hoisted(() => ({ init: vi.fn(), error: vi.fn() }));
vi.mock('@repo/telemetry/node', () => ({ initTelemetry: spies.init }));
vi.mock('../../src/lib/logger.server', () => ({ getServerLogger: () => ({ error: spies.error }) }));

import { onRequestError, register } from '../../instrumentation';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

const request = { method: 'GET', path: '/projects/private-id?token=private', headers: { authorization: 'Bearer private', cookie: 'session=private' } };
const context = {
  routerKind: 'App Router', routePath: '/projects/[id]', routeType: 'render',
  renderSource: 'react-server-components', revalidateReason: undefined,
} satisfies Parameters<Instrumentation.onRequestError>[2];

describe('Next instrumentation', () => {
  it('initializes the shared provider without duplicate HTTP instrumentation', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    await register();
    expect(spies.init).toHaveBeenCalledWith({ service: 'tickif-web', instrumentation: 'none' });
  });

  it('keeps the Edge path free of Node initialization and server logging', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge');
    await register();
    await onRequestError(new Error('Edge error'), request, context);
    expect(spies.init).not.toHaveBeenCalled();
    expect(spies.error).not.toHaveBeenCalled();
  });

  it('logs route categories and digest without serializing headers or request URLs', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    const error = Object.assign(new Error('Rendering failed'), { digest: 'digest-123' });
    await onRequestError(error, request, context);
    expect(spies.error).toHaveBeenCalledWith({
      event: 'web.request.error', error, method: 'GET', route: '/projects/[id]', routeType: 'render', errorCode: 'digest-123',
    }, 'Next.js request failed');
    expect(JSON.stringify(spies.error.mock.calls)).not.toContain('private');
  });
});
