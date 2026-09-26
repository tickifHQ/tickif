import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AdminEnquiriesLoading from '../../../../app/(admin)/admin/enquiries/loading';

describe('AdminEnquiriesLoading', () => {
  it('matches the responsive enquiry list structure while data loads', () => {
    const { container } = render(<AdminEnquiriesLoading />);
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(27);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
