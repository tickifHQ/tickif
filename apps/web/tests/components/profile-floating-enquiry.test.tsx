import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProfileFloatingEnquiry } from '../../src/components/profile-floating-enquiry';

vi.mock('@/components/enquiry-cta', () => ({
  EnquiryCta: ({ ariaLabel }: { ariaLabel: string }) => (
    <button aria-label={ariaLabel}>Enquire</button>
  ),
}));

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('ProfileFloatingEnquiry', () => {
  it('appears after the hero and yields to the full enquiry section', () => {
    const hero = document.createElement('section');
    hero.setAttribute('aria-label', 'Portfolio hero');
    const enquiry = document.createElement('section');
    enquiry.id = 'enquire';
    document.body.append(hero, enquiry);
    let onEntries: IntersectionObserverCallback = () => undefined;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          onEntries = callback;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    const { unmount } = render(
      <ProfileFloatingEnquiry
        designerProfileId="profile-1"
        designerName="Studio Meraki"
        logoUrl={null}
        initials="SM"
        loginHref="/login"
      />,
    );
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    const entry = (target: Element, isIntersecting: boolean) =>
      ({ target, isIntersecting }) as IntersectionObserverEntry;
    act(() => onEntries([entry(hero, false)], {} as IntersectionObserver));
    expect(screen.getByRole('complementary', { name: 'Contact this studio' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Enquire about this studio' })).toBeEnabled();
    act(() => onEntries([entry(enquiry, true)], {} as IntersectionObserver));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
