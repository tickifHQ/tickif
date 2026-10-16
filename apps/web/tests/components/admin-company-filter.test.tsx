import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/lib/admin-visibility-api', () => ({ fetchAdminCompanyOptions: mocks.fetch }));
import { AdminCompanyFilter } from '../../src/components/admin-company-filter';

function open() {
  const details = screen.getByText('Alpha Studio').closest('details')!;
  details.open = true;
  fireEvent(details, new Event('toggle'));
}
beforeEach(() => vi.clearAllMocks());
describe('AdminCompanyFilter', () => {
  it('searches paginated companies and clears the prior designer when selecting another company', async () => {
    mocks.fetch.mockResolvedValue({
      items: [{ id: 'org-2', name: 'Beta Studio' }],
      page: 1,
      limit: 25,
      total: 26,
      totalPages: 2,
    });
    const { container } = render(
      <form>
        <AdminCompanyFilter value="org-1" name="Alpha Studio" designerId="designer-1" />
      </form>,
    );
    expect(container.querySelector('input[name=designerId]')).toHaveValue('designer-1');
    open();
    fireEvent.change(await screen.findByRole('textbox', { name: 'Search companies' }), {
      target: { value: 'Beta' },
    });
    await screen.findByRole('button', { name: 'Beta Studio' });
    expect(mocks.fetch).toHaveBeenLastCalledWith(
      { q: 'Beta', page: 1, limit: 25 },
      undefined,
      expect.any(AbortSignal),
    );
    fireEvent.click(screen.getByRole('button', { name: 'More companies' }));
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenLastCalledWith(
        { q: 'Beta', page: 2, limit: 25 },
        undefined,
        expect.any(AbortSignal),
      ),
    );
    await screen.findByRole('button', { name: 'Beta Studio' });
    fireEvent.click(screen.getByRole('button', { name: 'Beta Studio' }));
    expect(container.querySelector('input[name=organizationId]')).toHaveValue('org-2');
    expect(container.querySelector('input[name=designerId]')).toBeNull();
    expect(document.activeElement?.tagName).toBe('SUMMARY');
  });
  it('offers a recoverable failure and can explicitly clear the company selection', async () => {
    mocks.fetch.mockRejectedValue(new Error('Network unavailable'));
    const { container } = render(<AdminCompanyFilter value="org-1" name="Alpha Studio" />);
    open();
    expect(await screen.findByText(/Companies could not be loaded/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All companies' }));
    expect(container.querySelector('input[name=organizationId]')).toHaveValue('');
  });
  it('dismisses the company picker with Escape and restores focus to its summary', async () => {
    mocks.fetch.mockResolvedValue({ items: [], page: 1, limit: 25, total: 0, totalPages: 0 });
    render(<AdminCompanyFilter value="org-1" name="Alpha Studio" />);
    open();
    const input = await screen.findByRole('textbox', { name: 'Search companies' });
    input.focus();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('textbox', { name: 'Search companies' })).not.toBeInTheDocument();
    expect(document.activeElement?.tagName).toBe('SUMMARY');
  });
});
