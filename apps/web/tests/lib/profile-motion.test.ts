import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountProfileMotion } from '../../src/lib/profile-motion';

let root: HTMLElement;
let reduced: EventTarget & { matches: boolean };
let pointer: EventTarget & { matches: boolean };
let onIntersection: IntersectionObserverCallback;
let frames: Map<number, FrameRequestCallback>;
let stop: (() => void) | undefined;
const disconnect = vi.fn();
const observe = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  reduced = Object.assign(new EventTarget(), { matches: false });
  pointer = Object.assign(new EventTarget(), { matches: true });
  vi.stubGlobal('matchMedia', (query: string) =>
    query.includes('reduced-motion') ? reduced : pointer,
  );
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        onIntersection = callback;
      }
      observe = observe;
      unobserve = vi.fn();
      disconnect = disconnect;
    },
  );
  frames = new Map();
  let id = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (frame: number) => frames.delete(frame));
  vi.spyOn(performance, 'now').mockReturnValue(0);
  root = document.createElement('main');
  root.innerHTML = `<div class="profile-hero-copy"><dl>
    <dd aria-label="4.8"><span aria-hidden="true" data-profile-count="Rating">4.8</span></dd>
    <dd aria-label="2017"><span aria-hidden="true" data-profile-count="Established">2017</span></dd>
    <dd aria-label="₹5–15L"><span aria-hidden="true" data-profile-count="Starting at">₹5–15L</span></dd>
    </dl></div><article class="profile-project-card"><a href="#work">Project</a></article>
    <div class="profile-identity-card"></div>`;
  document.body.append(root);
  vi.spyOn(root.querySelector<HTMLElement>('article')!, 'getBoundingClientRect').mockReturnValue({
    top: 2000,
  } as DOMRect);
});
afterEach(() => {
  stop?.();
  stop = undefined;
  root.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function intersect(target: Element) {
  onIntersection(
    [{ target, isIntersecting: true } as IntersectionObserverEntry],
    {} as IntersectionObserver,
  );
}
function frame(now: number) {
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((callback) => callback(now));
}

describe('profile motion enhancement', () => {
  it('keeps server content visible without observer support or with reduced motion', () => {
    reduced.matches = true;
    stop = mountProfileMotion(root);
    expect(root.querySelector('[data-profile-reveal]')).toBeNull();
    expect(root.textContent).toContain('4.8');
    expect(frames.size).toBe(0);
    stop();
    reduced.matches = false;
    vi.stubGlobal('IntersectionObserver', undefined);
    stop = mountProfileMotion(root);
    expect(root.dataset.profileMotion).toBeUndefined();
    stop();
    // Older browsers genuinely omit the property.
    Reflect.deleteProperty(window, 'IntersectionObserver');
    stop = mountProfileMotion(root);
    expect(root.dataset.profileMotion).toBeUndefined();
  });
  it('reveals offscreen cards on entry and immediately reveals a keyboard focus target', () => {
    stop = mountProfileMotion(root);
    const card = root.querySelector<HTMLElement>('article')!;
    expect(card.dataset.profileReveal).toBe('pending');
    vi.spyOn(card.querySelector('a')!, 'matches').mockReturnValue(true);
    card.querySelector('a')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(card.dataset.profileReveal).toBe('visible');
    intersect(card);
    expect(card.dataset.profileInview).toBe('true');
  });
  it('does not snap a revealing control when pointer focus arrives before click release', () => {
    stop = mountProfileMotion(root);
    const card = root.querySelector<HTMLElement>('article')!;
    const link = card.querySelector('a')!;
    vi.spyOn(link, 'matches').mockReturnValue(false);
    link.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(card.dataset.profileReveal).toBe('pending');
    intersect(card);
    expect(card.dataset.profileReveal).toBe('visible');
  });
  it('counts numeric statistics to their real values while keeping accessible labels and ranges stable', () => {
    stop = mountProfileMotion(root);
    intersect(root.querySelector('dl')!);
    frame(800);
    expect(root.querySelector('[data-profile-count="Rating"]')?.textContent).toBe('4.2');
    expect(root.querySelector('dd')?.getAttribute('aria-label')).toBe('4.8');
    expect(root.textContent).toContain('₹5–15L');
    frame(1600);
    expect(root.querySelector('[data-profile-count="Rating"]')?.textContent).toBe('4.8');
    expect(root.querySelector('[data-profile-count="Established"]')?.textContent).toBe('2017');
    expect(frames.size).toBe(0);
  });
  it('cancels pending work and reveals all content when reduced motion is enabled mid-animation', () => {
    stop = mountProfileMotion(root);
    intersect(root.querySelector('dl')!);
    frame(200);
    reduced.matches = true;
    reduced.dispatchEvent(new Event('change'));
    expect(frames.size).toBe(0);
    expect(root.querySelector('[data-profile-reveal]')).toBeNull();
    expect(root.querySelector('[data-profile-count="Rating"]')?.textContent).toBe('4.8');
    expect(disconnect).toHaveBeenCalled();
  });
  it('clears pointer tilt and queued frames on unmount', () => {
    stop = mountProfileMotion(root);
    const card = root.querySelector<HTMLElement>('.profile-identity-card')!;
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 400,
      height: 500,
    } as DOMRect);
    card.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 300, clientY: 125, pointerType: 'mouse' }),
    );
    frame(16);
    expect(card.dataset.profileTilting).toBe('true');
    expect(card.style.getPropertyValue('--profile-tilt-y')).toBe('3.5deg');
    stop();
    expect(card.dataset.profileTilting).toBeUndefined();
    expect(frames.size).toBe(0);
    expect(root.dataset.profileMotion).toBeUndefined();
  });
});
