import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  enabled: false,
  error: vi.fn(),
  flush: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/env', () => ({ env: {
  get NEXT_PUBLIC_TELEMETRY_ENABLED() { return state.enabled; },
  NEXT_PUBLIC_APP_VERSION: 'release-test',
} }));
vi.mock('@repo/logger/browser', () => ({ createBrowserLogger: () => ({ error: state.error, flush: state.flush }) }));
vi.mock('@/lib/telemetry-api', () => ({ sendBrowserLogs: vi.fn() }));

import { initializeBrowserTelemetry, reportBrowserError } from '../../src/lib/logger.browser';

const INSTALL_KEY = Symbol.for('tickif.browser.telemetry.listeners');

beforeEach(() => {
  state.enabled = false;
  state.error.mockClear();
  state.flush.mockClear();
  const target = window as Window & { [INSTALL_KEY]?: () => void };
  target[INSTALL_KEY]?.();
});

describe('web browser logger wiring', () => {
  it('does not install listeners when the build flag is disabled', () => {
    initializeBrowserTelemetry();
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('Disabled') }));
    expect(state.error).not.toHaveBeenCalled();
  });

  it('replaces listeners on repeated initialization and preserves boundary digests', () => {
    state.enabled = true;
    initializeBrowserTelemetry();
    initializeBrowserTelemetry();
    const error = Object.assign(new Error('Render failed'), { digest: 'server-digest' });
    window.dispatchEvent(new ErrorEvent('error', { error }));
    reportBrowserError(error, 'root.boundary');
    expect(state.error).toHaveBeenCalledOnce();
    expect(state.error).toHaveBeenCalledWith(expect.objectContaining({ error, errorCode: 'server-digest' }), 'Browser application error');
  });

  it('does not serialize arbitrary rejection values', () => {
    reportBrowserError({ password: 'private', content: 'private' }, 'window.unhandledrejection');
    const fields = state.error.mock.calls[0]?.[0] as { error: Error };
    expect(fields.error.message).toBe('Unhandled non-Error rejection');
    expect(JSON.stringify(fields)).not.toContain('private');
  });
});
