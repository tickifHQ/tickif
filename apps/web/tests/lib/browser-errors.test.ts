import { describe, expect, it, vi } from 'vitest';
import { createErrorReporter, installErrorListeners } from '../../src/lib/browser-errors';

describe('browser error reporting', () => {
  it('reports one instance once across listeners and boundaries, while allowing later errors', () => {
    const send = vi.fn();
    const report = createErrorReporter(send);
    const error = new Error('Rendering failed');
    report(error, 'window.error');
    report(error, 'root.boundary');
    report(new Error('Rendering failed'), 'root.boundary');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('never throws when reporting fails', () => {
    const report = createErrorReporter(() => { throw new Error('Transport failed'); });
    expect(() => report(new Error('Original'), 'root.boundary')).not.toThrow();
  });

  it('captures exceptions and rejections and removes all listeners on cleanup', async () => {
    const report = vi.fn();
    const flush = vi.fn().mockResolvedValue(undefined);
    const cleanup = installErrorListeners(window, report, flush);
    const error = new Error('Original');
    window.dispatchEvent(new ErrorEvent('error', { error }));
    const rejection = new Event('unhandledrejection');
    Object.defineProperty(rejection, 'reason', { value: error });
    window.dispatchEvent(rejection);
    window.dispatchEvent(new Event('pagehide'));
    await Promise.resolve();
    expect(report.mock.calls).toEqual([[error, 'window.error'], [error, 'window.unhandledrejection']]);
    expect(flush).toHaveBeenCalledOnce();
    cleanup();
    window.dispatchEvent(new ErrorEvent('error', { error }));
    window.dispatchEvent(rejection);
    window.dispatchEvent(new Event('pagehide'));
    expect(report).toHaveBeenCalledTimes(2);
    expect(flush).toHaveBeenCalledOnce();
  });
});
