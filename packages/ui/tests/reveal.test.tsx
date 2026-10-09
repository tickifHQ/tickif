import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Reveal } from '../src/components/reveal';

afterEach(() => vi.unstubAllGlobals());

function motionEnvironment(reduced = false) {
  let intersect: IntersectionObserverCallback;
  let preferenceChanged: () => void;
  const disconnect = vi.fn();
  const observe = vi.fn();
  const preference = {
    matches: reduced,
    addEventListener: vi.fn((_event, fn) => {
      preferenceChanged = fn;
    }),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal('matchMedia', () => preference);
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        intersect = callback;
      }
      observe = observe;
      disconnect = disconnect;
    },
  );
  return {
    preference,
    observe,
    disconnect,
    enter: () =>
      intersect(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    change: () => preferenceChanged(),
  };
}

describe('Reveal', () => {
  it('reveals at the viewport boundary, disconnects, and cleans up on unmount', () => {
    const env = motionEnvironment();
    const { unmount } = render(
      <Reveal>
        <a href="/project">Project</a>
      </Reveal>,
    );
    const reveal = screen.getByRole('link').parentElement;
    expect(reveal).toHaveAttribute('data-reveal', 'pending');
    act(env.enter);
    expect(reveal).toHaveAttribute('data-reveal', 'visible');
    expect(env.disconnect).toHaveBeenCalledOnce();
    unmount();
    expect(env.preference.removeEventListener).toHaveBeenCalled();
  });
  it('keeps content visible for reduced motion and reacts to preference changes', () => {
    const env = motionEnvironment(true);
    render(
      <Reveal>
        <p>Project</p>
      </Reveal>,
    );
    const reveal = screen.getByText('Project').parentElement;
    expect(reveal).toHaveAttribute('data-reveal', 'static');
    expect(env.observe).not.toHaveBeenCalled();
    env.preference.matches = false;
    act(env.change);
    expect(reveal).toHaveAttribute('data-reveal', 'pending');
    env.preference.matches = true;
    act(env.change);
    expect(reveal).toHaveAttribute('data-reveal', 'static');
  });
  it('shows keyboard-focused content immediately', () => {
    motionEnvironment();
    render(
      <Reveal>
        <a href="/project">Project</a>
      </Reveal>,
    );
    fireEvent.focus(screen.getByRole('link'));
    expect(screen.getByRole('link').parentElement).toHaveAttribute('data-reveal', 'static');
  });
  it('fails open when IntersectionObserver is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(
      <Reveal>
        <p>Project</p>
      </Reveal>,
    );
    expect(screen.getByText('Project').parentElement).toHaveAttribute('data-reveal', 'static');
  });
});
