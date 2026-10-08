import { render } from '@testing-library/react';
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
});
