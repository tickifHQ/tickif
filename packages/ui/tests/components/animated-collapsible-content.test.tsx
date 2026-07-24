import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnimatedCollapsibleContent } from '../../src/components/animated-collapsible-content';

const UNMOUNT_FALLBACK_MS = 320;

describe('AnimatedCollapsibleContent', () => {
  let nextFrameId: number;
  let scheduledFrames: Map<number, FrameRequestCallback>;

  beforeEach(() => {
    vi.useFakeTimers();
    nextFrameId = 1;
    scheduledFrames = new Map();

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      scheduledFrames.set(frameId, callback);
      return frameId;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frameId) => {
      scheduledFrames.delete(frameId);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function flushAnimationFrame() {
    const currentFrames = [...scheduledFrames.entries()];
    currentFrames.forEach(([frameId]) => scheduledFrames.delete(frameId));
    currentFrames.forEach(([, callback]) => callback(0));
  }

  function getContent(container: HTMLElement) {
    return container.querySelector<HTMLElement>('[data-slot="animated-collapsible-content"]');
  }

  it('restarts the opening transition when reopened before the closing content unmounts', () => {
    const { container, rerender } = render(
      <AnimatedCollapsibleContent open>
        <p>Portfolio settings</p>
      </AnimatedCollapsibleContent>,
    );

    rerender(
      <AnimatedCollapsibleContent open={false}>
        <p>Portfolio settings</p>
      </AnimatedCollapsibleContent>,
    );
    expect(getContent(container)).toHaveClass('grid-rows-[0fr]', 'opacity-0');

    rerender(
      <AnimatedCollapsibleContent open>
        <p>Portfolio settings</p>
      </AnimatedCollapsibleContent>,
    );
    expect(getContent(container)).toHaveClass('grid-rows-[0fr]', 'opacity-0');

    act(flushAnimationFrame);
    expect(getContent(container)).toHaveClass('grid-rows-[0fr]', 'opacity-0');

    act(flushAnimationFrame);
    expect(getContent(container)).toHaveClass('grid-rows-[1fr]', 'opacity-100');
  });

  it('mounts collapsed content before opening after the close fallback unmounts it', () => {
    const { container, rerender } = render(
      <AnimatedCollapsibleContent open>
        <p>Portfolio settings</p>
      </AnimatedCollapsibleContent>,
    );

    rerender(
      <AnimatedCollapsibleContent open={false}>
        <p>Portfolio settings</p>
      </AnimatedCollapsibleContent>,
    );
    act(() => vi.advanceTimersByTime(UNMOUNT_FALLBACK_MS));
    expect(screen.queryByText('Portfolio settings')).not.toBeInTheDocument();

    rerender(
      <AnimatedCollapsibleContent open>
        <p>Portfolio settings</p>
      </AnimatedCollapsibleContent>,
    );
    expect(getContent(container)).toHaveClass('grid-rows-[0fr]', 'opacity-0');

    act(flushAnimationFrame);
    expect(getContent(container)).toHaveClass('grid-rows-[0fr]', 'opacity-0');

    act(flushAnimationFrame);
    expect(getContent(container)).toHaveClass('grid-rows-[1fr]', 'opacity-100');
  });
});
