import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProfileTestimonialQuote } from '../../src/components/profile-testimonial-quote';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Profile testimonial quote', () => {
  it('limits long quotes to 60 complete words with an ellipsis', () => {
    const words = Array.from({ length: 65 }, (_, index) => `word${index + 1}`);
    render(<ProfileTestimonialQuote quote={words.join(' \n ')} />);
    expect(screen.getByRole('blockquote')).toHaveTextContent(`${words.slice(0, 60).join(' ')}…`);
    expect(screen.getByRole('blockquote')).not.toHaveTextContent('word61');
  });

  it('preserves quotes at the word limit without an ellipsis', () => {
    const quote = Array.from({ length: 60 }, () => 'lovely').join(' ');
    render(<ProfileTestimonialQuote quote={quote} />);
    expect(screen.getByRole('blockquote')).toHaveTextContent(quote);
    expect(screen.getByRole('blockquote')).not.toHaveTextContent('…');
  });

  it('shrinks overflowing text and restores its size when the container grows', () => {
    let resize = () => {};
    let height = 96;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => height);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500);
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      const fontSize = Number.parseFloat(this.parentElement?.style.fontSize ?? '44');
      return fontSize * 4;
    });
    const { unmount } = render(<ProfileTestimonialQuote quote="A wonderful home." />);
    const blockquote = screen.getByRole('blockquote');
    expect(Number.parseFloat(blockquote.style.fontSize)).toBeLessThanOrEqual(24);
    height = 240;
    resize();
    expect(blockquote.style.fontSize).toBe('44px');
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});
