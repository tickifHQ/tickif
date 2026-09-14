import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ListPagination, UrlListPagination } from '../../src/components/list-pagination';

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/moderation',
  useRouter: () => navigation,
  useSearchParams: () => new URLSearchParams('status=published&page=2'),
}));

describe('ListPagination', () => {
  beforeEach(() => navigation.replace.mockReset());

  it('preserves the current query when rendering URL pagination links', () => {
    render(<UrlListPagination page={2} totalPages={4} total={64} limit={20} />);

    expect(screen.getByRole('link', { name: 'First page' })).toHaveAttribute(
      'href',
      '/moderation?status=published&page=1',
    );
    expect(screen.getByRole('link', { name: 'Next page' })).toHaveAttribute(
      'href',
      '/moderation?status=published&page=3',
    );
  });

  it('supports controlled queue navigation and hides page-size controls when requested', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(
      <ListPagination
        page={2}
        totalPages={4}
        total={64}
        limit={20}
        itemName="review"
        showPageSize={false}
        onPageChange={onPageChange}
      />,
    );

    expect(screen.getByText('Page 2 of 4 · 64 reviews')).toBeInTheDocument();
    expect(screen.queryByLabelText('Rows per page')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });
});
