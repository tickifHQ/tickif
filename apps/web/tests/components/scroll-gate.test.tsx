import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScrollGate } from '../../src/components/scroll-gate';

const pathnameState = vi.hoisted(() => ({ value: '/blog/article' }));
const envState = vi.hoisted(() => ({ NEXT_PUBLIC_SCROLL_GATE_LIMIT: 1 }));
let frameCallbacks: FrameRequestCallback[] = [];
let resizeObserverCallbacks: ResizeObserverCallback[] = [];
let measuredCardHeight = 400;
let loginCardRenders = 0;

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameState.value,
}));

vi.mock('../../src/env', () => ({
  env: envState,
}));

vi.mock('../../src/components/login-card', () => ({
  LoginCard: ({ onClose }: { onClose: () => void }) => {
    loginCardRenders += 1;
    return (
      <div data-testid="login-card">
        <button type="button" onClick={onClose}>
          Close
        </button>
        <button type="button">Continue</button>
      </div>
    );
  },
}));

function flushAnimationFrames() {
  const callbacks = frameCallbacks;
  frameCallbacks = [];
  callbacks.forEach((callback) => callback(0));
}

function notifyResizeObservers() {
  const callbacks = [...resizeObserverCallbacks];
  callbacks.forEach((callback) => callback([], {} as ResizeObserver));
}

function scrollTo(y: number) {
  act(() => {
    window.scrollY = y;
    window.dispatchEvent(new Event('scroll'));
    flushAnimationFrames();
  });
}

describe('ScrollGate', () => {
  beforeEach(() => {
    pathnameState.value = '/blog/article';
    envState.NEXT_PUBLIC_SCROLL_GATE_LIMIT = 1;
    frameCallbacks = [];
    resizeObserverCallbacks = [];
    measuredCardHeight = 400;
    loginCardRenders = 0;
    window.localStorage.clear();
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 0,
      writable: true,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 900,
      writable: true,
    });
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 2_900,
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      () =>
        ({
          bottom: measuredCardHeight,
          height: measuredCardHeight,
          left: 0,
          right: 0,
          top: 0,
          width: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    );
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resizeObserverCallbacks.push(callback);
        }

        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        media: '(prefers-reduced-motion: reduce)',
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('leaves landing photography undimmed until the login panel enters the viewport', () => {
    pathnameState.value = '/';
    render(<ScrollGate />);
    scrollTo(200);
    expect(screen.getByTestId('scroll-signup-backdrop')).toHaveStyle({ opacity: '0' });
    scrollTo(1_000);
    expect(screen.getByTestId('scroll-signup-backdrop')).toHaveStyle({ opacity: '0.6' });
    expect(screen.getByRole('dialog', { name: 'Sign in required' })).toBeVisible();
  });

  it('does not render on a viewport-height page and activates after enough content is added', () => {
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 900,
    });
    render(<ScrollGate />);

    expect(screen.queryByTestId('scroll-signup-gate')).not.toBeInTheDocument();
    act(() => window.dispatchEvent(new Event('scroll')));
    expect(screen.queryByTestId('scroll-signup-gate')).not.toBeInTheDocument();

    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 2_900,
    });
    act(notifyResizeObservers);

    expect(screen.getByTestId('scroll-signup-gate')).toHaveAttribute(
      'data-scroll-progress',
      '0.000',
    );
    scrollTo(1_000);
    expect(screen.getByRole('dialog', { name: 'Sign in required' })).toBeVisible();
  });

  it('does not measure or render the prompt when the feature is disabled', () => {
    envState.NEXT_PUBLIC_SCROLL_GATE_LIMIT = 0;
    render(<ScrollGate />);

    expect(screen.queryByTestId('scroll-signup-measurement')).not.toBeInTheDocument();
    expect(screen.queryByTestId('scroll-signup-gate')).not.toBeInTheDocument();
    scrollTo(1_000);
    expect(screen.queryByTestId('scroll-signup-gate')).not.toBeInTheDocument();
  });

  it('keeps the gate hidden when a page is scrollable but cannot hold the card below the viewport', () => {
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 1_500,
    });
    render(<ScrollGate />);

    expect(screen.getByTestId('scroll-signup-measurement')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByTestId('scroll-signup-gate')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Sign in required' })).not.toBeInTheDocument();

    scrollTo(600);
    expect(screen.queryByTestId('scroll-signup-gate')).not.toBeInTheDocument();
  });

  it('reveals on a medium-length desktop page while starting below the first viewport', () => {
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 1_080,
      writable: true,
    });
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 2_127,
    });
    measuredCardHeight = 411;
    render(<ScrollGate />);

    expect(screen.getByTestId('scroll-signup-gate')).toHaveAttribute(
      'data-scroll-progress',
      '0.000',
    );
    expect(screen.getByTestId('login-card').parentElement).toHaveStyle({
      transform: 'translate3d(0, 746px, 0)',
    });

    scrollTo(746);
    expect(screen.getByRole('dialog', { name: 'Sign in required' })).toBeVisible();
  });

  it('activates exactly when the card can start below the viewport and reach its center', () => {
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 1_549,
    });
    render(<ScrollGate />);
    expect(screen.queryByTestId('scroll-signup-gate')).not.toBeInTheDocument();

    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 1_550,
    });
    act(notifyResizeObservers);

    expect(screen.getByTestId('scroll-signup-gate')).toHaveAttribute(
      'data-scroll-progress',
      '0.000',
    );
  });

  it('rechecks eligibility when responsive wrapping changes the card height', () => {
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 1_575,
    });
    render(<ScrollGate />);
    expect(screen.getByTestId('scroll-signup-gate')).toBeInTheDocument();

    measuredCardHeight = 500;
    act(() => window.dispatchEvent(new Event('resize')));
    expect(screen.queryByTestId('scroll-signup-gate')).not.toBeInTheDocument();
    expect(screen.getByTestId('scroll-signup-measurement')).toBeInTheDocument();

    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 1_600,
    });
    act(notifyResizeObservers);
    expect(screen.getByTestId('scroll-signup-gate')).toBeInTheDocument();
  });

  it('keeps an active form visible when the viewport changes', () => {
    render(<ScrollGate />);
    scrollTo(1_000);
    expect(screen.getByRole('dialog', { name: 'Sign in required' })).toBeVisible();

    measuredCardHeight = 2_000;
    act(() => window.dispatchEvent(new Event('resize')));

    expect(screen.getByRole('dialog', { name: 'Sign in required' })).toBeVisible();
    expect(screen.getByTestId('scroll-signup-gate')).toHaveAttribute(
      'data-scroll-progress',
      '1.000',
    );
  });

  it('reveals with downward scroll and reverses with upward scroll', () => {
    render(<ScrollGate />);

    const gate = screen.getByTestId('scroll-signup-gate');
    expect(gate).toHaveAttribute('data-scroll-progress', '0.000');
    expect(gate).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('scroll-signup-backdrop')).toHaveStyle({ opacity: '0' });
    expect(screen.getByTestId('login-card').parentElement).toHaveStyle({
      pointerEvents: 'none',
      transform: 'translate3d(0, 1000px, 0)',
    });

    scrollTo(500);
    expect(gate).toHaveAttribute('data-scroll-progress', '0.500');
    expect(gate).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('scroll-signup-backdrop')).toHaveStyle({ opacity: '0.3' });
    expect(screen.getByTestId('login-card').parentElement).toHaveStyle({
      pointerEvents: 'none',
      transform: 'translate3d(0, 500px, 0)',
    });

    scrollTo(1_000);
    expect(screen.getByRole('dialog', { name: 'Sign in required' })).toBeVisible();
    expect(gate).toHaveAttribute('data-scroll-progress', '1.000');
    expect(gate).toHaveAttribute('aria-hidden', 'false');
    expect(screen.getByTestId('scroll-signup-backdrop')).toHaveStyle({ opacity: '0.6' });

    scrollTo(1_200);
    expect(gate).toHaveAttribute('data-scroll-progress', '1.000');

    scrollTo(1_000);
    expect(gate).toHaveAttribute('data-scroll-progress', '1.000');

    scrollTo(500);
    expect(gate).toHaveAttribute('data-scroll-progress', '0.500');
    expect(gate).toHaveAttribute('aria-hidden', 'true');

    scrollTo(0);
    expect(gate).toHaveAttribute('data-scroll-progress', '0.000');
    expect(screen.getByTestId('login-card').parentElement).toHaveStyle({
      transform: 'translate3d(0, 1000px, 0)',
    });
  });

  it('updates scrolling visuals without rerendering the login form each frame', () => {
    render(<ScrollGate />);
    const initialRenders = loginCardRenders;

    for (const y of [200, 400, 600, 800, 1_000, 800, 400, 0]) {
      scrollTo(y);
    }

    expect(loginCardRenders).toBe(initialRenders);
    expect(screen.getByTestId('scroll-signup-gate')).toHaveAttribute(
      'data-scroll-progress',
      '0.000',
    );
  });

  it('anchors the card to the page until half of the scroll range', () => {
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 4_900,
    });
    render(<ScrollGate />);

    scrollTo(1_000);
    expect(screen.getByTestId('scroll-signup-gate')).toHaveAttribute(
      'data-scroll-progress',
      '0.500',
    );
    expect(screen.getByTestId('login-card').parentElement).toHaveStyle({
      transform: 'translate3d(0, 1000px, 0)',
    });

    scrollTo(2_000);
    expect(screen.getByRole('dialog', { name: 'Sign in required' })).toBeVisible();
  });

  it('recalculates half of the page when late content changes its height', () => {
    render(<ScrollGate />);
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 4_900,
    });
    act(notifyResizeObservers);

    expect(screen.getByTestId('scroll-signup-gate')).toHaveAttribute(
      'data-scroll-progress',
      '0.000',
    );
    expect(screen.getByTestId('login-card').parentElement).toHaveStyle({
      transform: 'translate3d(0, 2000px, 0)',
    });

    scrollTo(1_000);
    expect(screen.getByTestId('scroll-signup-gate')).toHaveAttribute(
      'data-scroll-progress',
      '0.500',
    );
    expect(screen.getByTestId('login-card').parentElement).toHaveStyle({
      transform: 'translate3d(0, 1000px, 0)',
    });

    scrollTo(2_000);
    expect(screen.getByRole('dialog', { name: 'Sign in required' })).toBeVisible();
  });

  it('keeps the initial halfway point when infinite scroll appends content', () => {
    render(<ScrollGate />);
    scrollTo(500);
    expect(screen.getByTestId('scroll-signup-gate')).toHaveAttribute(
      'data-scroll-progress',
      '0.500',
    );

    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 4_900,
    });
    act(notifyResizeObservers);
    expect(screen.getByTestId('login-card').parentElement).toHaveStyle({
      transform: 'translate3d(0, 500px, 0)',
    });

    scrollTo(1_000);
    expect(screen.getByRole('dialog', { name: 'Sign in required' })).toBeVisible();
  });

  it('dismisses immediately and shares the cooldown across remounts', () => {
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const { unmount } = render(<ScrollGate />);

    scrollTo(1_001);
    expect(screen.getByRole('dialog', { name: 'Sign in required' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByTestId('scroll-signup-gate')).not.toBeInTheDocument();
    expect(Number(window.localStorage.getItem('tickif:scroll-gate-dismissed-until:v2'))).toBe(
      now + 5 * 60_000,
    );

    unmount();
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0, writable: true });
    render(<ScrollGate />);
    scrollTo(1_001);
    expect(screen.queryByTestId('scroll-signup-gate')).not.toBeInTheDocument();

    now += 5 * 60_000;
    scrollTo(2_001);
    act(flushAnimationFrames);
    expect(screen.getByRole('dialog', { name: 'Sign in required' })).toBeVisible();
  });

  it('resets scroll progress when the public route changes without starting a cooldown', () => {
    const view = render(<ScrollGate />);
    scrollTo(1_000);
    expect(screen.getByRole('dialog', { name: 'Sign in required' })).toBeVisible();

    pathnameState.value = '/designers';
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0, writable: true });
    view.rerender(<ScrollGate />);

    expect(screen.getByTestId('scroll-signup-gate')).toHaveAttribute(
      'data-scroll-progress',
      '0.000',
    );
    expect(window.localStorage.getItem('tickif:scroll-gate-dismissed-until:v2')).toBeNull();
    scrollTo(1_000);
    expect(screen.getByRole('dialog', { name: 'Sign in required' })).toBeVisible();
  });

  it('removes the prompt when navigation lands on a viewport-height page', () => {
    const view = render(<ScrollGate />);
    expect(screen.getByTestId('scroll-signup-gate')).toBeInTheDocument();

    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 900,
    });
    pathnameState.value = '/blog';
    view.rerender(<ScrollGate />);

    expect(screen.queryByTestId('scroll-signup-gate')).not.toBeInTheDocument();
  });

  it('honors a dismissal written by another browser tab', () => {
    const now = 1_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    render(<ScrollGate />);
    scrollTo(1_000);
    expect(screen.getByRole('dialog', { name: 'Sign in required' })).toBeVisible();

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'tickif:scroll-gate-dismissed-until:v2',
          newValue: String(now + 60_000),
        }),
      );
    });

    expect(screen.queryByTestId('scroll-signup-gate')).not.toBeInTheDocument();
    scrollTo(2_000);
    expect(screen.queryByTestId('scroll-signup-gate')).not.toBeInTheDocument();
  });

  it('dismisses a fully revealed prompt with Escape', () => {
    render(<ScrollGate />);
    scrollTo(1_000);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByTestId('scroll-signup-gate')).not.toBeInTheDocument();
    expect(window.localStorage.getItem('tickif:scroll-gate-dismissed-until:v2')).not.toBeNull();
  });

  it('focuses the revealed dialog, blocks the page behind it, and restores focus on scroll up', () => {
    render(
      <>
        <button type="button">Background action</button>
        <ScrollGate />
      </>,
    );
    const backgroundAction = screen.getByRole('button', { name: 'Background action' });
    backgroundAction.focus();

    scrollTo(1_000);

    const dialog = screen.getByRole('dialog', { name: 'Sign in required' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(backgroundAction.parentElement).toHaveAttribute('inert');
    expect(screen.getByTestId('scroll-signup-backdrop')).toHaveStyle({ pointerEvents: 'auto' });

    scrollTo(500);

    expect(document.activeElement).toBe(backgroundAction);
    expect(backgroundAction.parentElement).not.toHaveAttribute('inert');
    expect(screen.getByTestId('scroll-signup-backdrop')).toHaveStyle({ pointerEvents: 'none' });
  });

  it('returns focus on dismissal and does not dismiss a nested menu with Escape', () => {
    render(
      <>
        <button type="button">Background action</button>
        <ScrollGate />
      </>,
    );
    const backgroundAction = screen.getByRole('button', { name: 'Background action' });
    backgroundAction.focus();
    scrollTo(1_000);

    const nestedMenu = document.createElement('div');
    nestedMenu.setAttribute('role', 'menu');
    document.body.append(nestedMenu);
    fireEvent.keyDown(nestedMenu, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Sign in required' })).toBeInTheDocument();
    nestedMenu.remove();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(document.activeElement).toBe(backgroundAction);
    expect(backgroundAction.parentElement).not.toHaveAttribute('inert');
  });

  it('keeps Tab within the active dialog and preserves pre-existing inert siblings', () => {
    render(
      <>
        <button type="button">Background action</button>
        <ScrollGate />
      </>,
    );
    const preExistingInert = document.createElement('div');
    preExistingInert.setAttribute('inert', '');
    document.body.append(preExistingInert);
    scrollTo(1_000);

    const close = screen.getByRole('button', { name: 'Close' });
    const continueButton = screen.getByRole('button', { name: 'Continue' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(continueButton);
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(close);

    scrollTo(500);
    expect(preExistingInert).toHaveAttribute('inert');
    preExistingInert.remove();
  });

  it('restores page interaction if the active gate unmounts during navigation', () => {
    const view = render(
      <>
        <button type="button">Background action</button>
        <ScrollGate />
      </>,
    );
    const backgroundAction = screen.getByRole('button', { name: 'Background action' });
    backgroundAction.focus();
    scrollTo(1_000);
    expect(backgroundAction.parentElement).toHaveAttribute('inert');

    view.unmount();

    expect(document.body.querySelector('[inert]')).toBeNull();
  });

  it('does not animate partial progress when reduced motion is requested', () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
    render(<ScrollGate />);

    scrollTo(500);
    expect(screen.getByTestId('scroll-signup-gate')).toHaveAttribute(
      'data-scroll-progress',
      '0.500',
    );
    expect(screen.getByTestId('scroll-signup-backdrop')).toHaveStyle({ opacity: '0' });
    expect(screen.getByTestId('login-card').parentElement).toHaveStyle({
      transform: 'translate3d(0, 1000px, 0)',
    });

    scrollTo(1_000);
    expect(screen.getByRole('dialog', { name: 'Sign in required' })).toBeVisible();
  });
});
