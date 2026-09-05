import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DesignerMembershipExit } from '../../src/components/designer-membership-exit';

const mocks = vi.hoisted(() => ({
  leave: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock('../../src/lib/auth-client', () => ({
  authClient: { organization: { leave: mocks.leave } },
}));

describe('DesignerMembershipExit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.leave.mockResolvedValue({ data: {}, error: null });
  });

  it('lets an inactive member leave and navigates to studio selection', async () => {
    const user = userEvent.setup();
    render(<DesignerMembershipExit organizationId="org-1" />);

    await user.click(screen.getByRole('button', { name: 'Leave organisation' }));
    await user.click(screen.getByRole('button', { name: 'Confirm leave' }));

    await waitFor(() => {
      expect(mocks.leave).toHaveBeenCalledWith({ organizationId: 'org-1' });
    });
    expect(mocks.replace).toHaveBeenCalledWith('/designer/select-studio');
  });

  it('keeps a backend rejection visible', async () => {
    mocks.leave.mockResolvedValue({
      data: null,
      error: { message: 'Transfer ownership before leaving.' },
    });
    const user = userEvent.setup();
    render(<DesignerMembershipExit organizationId="org-1" />);

    await user.click(screen.getByRole('button', { name: 'Leave organisation' }));
    await user.click(screen.getByRole('button', { name: 'Confirm leave' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Transfer ownership before leaving.',
    );
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
