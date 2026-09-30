import { useLayoutEffect } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceShellFrame } from '../../src/components/workspace-shell-frame';

const mock = vi.hoisted(() => ({ pathname: '/designer/dashboard' }));

vi.mock('next/navigation', () => ({ usePathname: () => mock.pathname }));

describe('WorkspaceShellFrame', () => {
  it('preserves an early navigation open on mount and closes it on a route change', () => {
    mock.pathname = '/designer/dashboard';
    let opened = false;
    function EarlyNavigation() {
      useLayoutEffect(() => {
        if (opened) return;
        opened = true;
        // Reproduce an interaction before the initial passive effects finish.
        fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
      }, []);
      return <span>Workspace links</span>;
    }
    const shell = (
      <WorkspaceShellFrame
        navigationLabel="Designer navigation"
        renderSidebar={() => <EarlyNavigation />}
      >
        Dashboard
      </WorkspaceShellFrame>
    );
    const { rerender } = render(shell);

    expect(screen.getByRole('dialog', { name: 'Designer navigation' })).toBeInTheDocument();
    mock.pathname = '/designer/projects';
    rerender(
      <WorkspaceShellFrame
        navigationLabel="Designer navigation"
        renderSidebar={() => <span>Workspace links</span>}
      >
        Projects
      </WorkspaceShellFrame>,
    );
    expect(screen.queryByRole('dialog', { name: 'Designer navigation' })).not.toBeInTheDocument();
  });
});
