import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SavedProjectsSync } from '@/components/saved-projects-sync';

const mock = vi.hoisted(() => ({ router: { refresh: vi.fn() } }));
vi.mock('next/navigation', () => ({ useRouter: () => mock.router }));

const projectId = '11111111-1111-4111-8111-111111111111';
function dispatchSaved(detail: unknown) {
  act(() => window.dispatchEvent(new CustomEvent('tickif:project-saved', { detail })));
}

describe('SavedProjectsSync', () => {
  beforeEach(() => mock.router.refresh.mockReset());

  it.each([true, false])(
    'refreshes the caller’s list after a successful saved=%s change',
    (saved) => {
      render(<SavedProjectsSync userId="visitor-1" />);
      dispatchSaved({ userId: 'visitor-1', project: { projectId, saved } });
      expect(mock.router.refresh).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    null,
    { userId: 'someone-else', project: { projectId, saved: false } },
    { userId: 'visitor-1', project: { projectId: 'invalid', saved: false } },
    { userId: 'visitor-1', project: { projectId, saved: 'false' } },
    { userId: 'visitor-1' },
  ])('ignores events that do not describe a valid change for this account: %j', (detail) => {
    render(<SavedProjectsSync userId="visitor-1" />);
    dispatchSaved(detail);
    act(() => window.dispatchEvent(new Event('tickif:project-saved')));
    expect(mock.router.refresh).not.toHaveBeenCalled();
  });

  it('updates the account scope and removes the listener on unmount', () => {
    const { rerender, unmount } = render(<SavedProjectsSync userId="visitor-1" />);
    rerender(<SavedProjectsSync userId="visitor-2" />);
    dispatchSaved({ userId: 'visitor-1', project: { projectId, saved: false } });
    expect(mock.router.refresh).not.toHaveBeenCalled();
    dispatchSaved({ userId: 'visitor-2', project: { projectId, saved: false } });
    expect(mock.router.refresh).toHaveBeenCalledTimes(1);
    unmount();
    dispatchSaved({ userId: 'visitor-2', project: { projectId, saved: false } });
    expect(mock.router.refresh).toHaveBeenCalledTimes(1);
  });
});
