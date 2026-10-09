import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LegacyProfileReviewEntry } from '../../src/components/legacy-profile-review-entry';

const mocks = vi.hoisted(() => ({ router: { replace: vi.fn() } }));
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }));

describe('legacy profile review links', () => {
  beforeEach(() => mocks.router.replace.mockClear());
  it('opens the explicit Tickif review flow and preserves pagination', () => {
    window.history.replaceState(null, '', '/d/studio?reviewsPage=2#tickif-reviews');
    render(<LegacyProfileReviewEntry />);
    expect(mocks.router.replace).toHaveBeenCalledWith(
      '/d/studio?reviewsPage=2&review=tickif#tickif-reviews',
    );
  });
  it('leaves the normal Google ratings profile untouched', () => {
    window.history.replaceState(null, '', '/d/studio#reviews');
    render(<LegacyProfileReviewEntry />);
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it('opens a review link reached after the portfolio has already mounted', () => {
    window.history.replaceState(null, '', '/d/studio');
    render(<LegacyProfileReviewEntry />);
    window.history.replaceState(null, '', '/d/studio#tickif-reviews');
    fireEvent(window, new HashChangeEvent('hashchange'));
    expect(mocks.router.replace).toHaveBeenCalledWith('/d/studio?review=tickif#tickif-reviews');
  });

  it('does not redirect an explicit review URL or retain listeners after unmount', () => {
    window.history.replaceState(null, '', '/d/studio?review=tickif#tickif-reviews');
    const { unmount } = render(<LegacyProfileReviewEntry />);
    expect(mocks.router.replace).not.toHaveBeenCalled();
    unmount();
    window.history.replaceState(null, '', '/d/studio#tickif-reviews');
    fireEvent(window, new HashChangeEvent('hashchange'));
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });
});
