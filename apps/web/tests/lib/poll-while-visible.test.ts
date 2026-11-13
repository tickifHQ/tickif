import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pollWhileVisible } from '../../src/lib/poll-while-visible';

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('pollWhileVisible', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility('visible');
  });

  afterEach(() => {
    vi.useRealTimers();
    setVisibility('visible');
  });

  it('polls on the interval while the tab is visible', () => {
    const tick = vi.fn();
    const stop = pollWhileVisible(tick, 4000);

    vi.advanceTimersByTime(12_000);
    expect(tick).toHaveBeenCalledTimes(3);
    stop();
  });

  it('pauses in a hidden tab and refreshes as soon as the tab returns', () => {
    const tick = vi.fn();
    const stop = pollWhileVisible(tick, 4000);

    setVisibility('hidden');
    vi.advanceTimersByTime(60_000);
    expect(tick).not.toHaveBeenCalled();

    setVisibility('visible');
    expect(tick).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(4000);
    expect(tick).toHaveBeenCalledTimes(2);
    stop();
  });

  it('does not start polling in a tab that opens hidden', () => {
    setVisibility('hidden');
    const tick = vi.fn();
    const stop = pollWhileVisible(tick, 4000);

    vi.advanceTimersByTime(60_000);
    expect(tick).not.toHaveBeenCalled();
    stop();
  });

  it('stops for good once cleaned up', () => {
    const tick = vi.fn();
    const stop = pollWhileVisible(tick, 4000);

    stop();
    setVisibility('hidden');
    setVisibility('visible');
    vi.advanceTimersByTime(60_000);
    expect(tick).not.toHaveBeenCalled();
  });
});
