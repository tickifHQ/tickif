/**
 * Runs `tick` every `intervalMs` while the tab is visible. A hidden tab stops
 * polling; returning to it refreshes at once and resumes the interval.
 * Returns the cleanup that stops polling for good.
 */
export function pollWhileVisible(tick: () => void, intervalMs: number): () => void {
  let timer: number | undefined;
  const start = () => {
    timer ??= window.setInterval(tick, intervalMs);
  };
  const stop = () => {
    window.clearInterval(timer);
    timer = undefined;
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      stop();
    } else if (timer === undefined) {
      tick();
      start();
    }
  };

  if (document.visibilityState !== 'hidden') start();
  document.addEventListener('visibilitychange', onVisibilityChange);
  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    stop();
  };
}
