type ErrorReporter = (error: unknown, source: string) => void;

/** One report per error instance across React boundaries and global listeners. */
export function createErrorReporter(report: ErrorReporter): ErrorReporter {
  const seen = new WeakSet<object>();
  return (error, source) => {
    if (typeof error === 'object' && error !== null) {
      if (seen.has(error)) return;
      seen.add(error);
    }
    try {
      report(error, source);
    } catch {
      // Observability must never break the error boundary itself.
    }
  };
}

/** Returns a cleanup function so hot reloads cannot accumulate listeners. */
export function installErrorListeners(
  target: Window,
  report: ErrorReporter,
  flush: () => Promise<void>,
): () => void {
  const onError = (event: ErrorEvent) => report(event.error ?? new Error('Browser script error'), 'window.error');
  const onRejection = (event: PromiseRejectionEvent) => report(event.reason, 'window.unhandledrejection');
  const onPageHide = () => { void flush().catch(() => undefined); };
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  target.addEventListener('pagehide', onPageHide);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
    target.removeEventListener('pagehide', onPageHide);
  };
}
