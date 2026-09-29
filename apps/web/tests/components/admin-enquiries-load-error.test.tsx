import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AdminEnquiriesLoadError } from '../../src/components/admin-enquiries-load-error';

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

describe('AdminEnquiriesLoadError', () => {
  it('offers a retry without mutating enquiry data', async () => {
    const user = userEvent.setup();
    render(<AdminEnquiriesLoadError message="Please try again." />);

    expect(screen.getByRole('alert')).toHaveTextContent('Please try again.');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});
