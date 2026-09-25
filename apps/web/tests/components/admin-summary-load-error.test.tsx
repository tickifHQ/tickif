import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { AdminSummaryLoadError } from '../../src/components/admin-summary-load-error';

describe('AdminSummaryLoadError', () => {
  it('shows the supplied error without metrics and retries the server render', () => {
    render(<AdminSummaryLoadError message="The summary is temporarily unavailable." />);

    expect(screen.getByRole('alert')).toHaveTextContent('temporarily unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refresh).toHaveBeenCalledOnce();
  });
});
