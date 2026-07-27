import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ListProjectsResponse } from '@repo/contracts';
import { DesignerProjectsList } from '../../src/components/designer-projects-list';

vi.mock('next/navigation', () => ({
  usePathname: () => '/designer/projects',
  useRouter: () => ({
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

const projects: ListProjectsResponse = {
  page: 1,
  limit: 12,
  total: 2,
  totalPages: 1,
  items: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      slug: '2bhk-apartment-in-velachery',
      title: '2BHK Apartment in Velachery',
      propertyType: 'Apartment',
      city: 'Chennai',
      locality: 'Velachery',
      status: 'published',
      coverImageUrl: null,
      createdAt: '2024-01-06T00:00:00.000Z',
      updatedAt: new Date().toISOString(),
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      slug: '4bhk-villa-in-omr',
      title: '4BHK Villa in OMR',
      propertyType: 'Villa',
      city: 'Chennai',
      locality: 'OMR',
      status: 'changes_requested',
      coverImageUrl: null,
      createdAt: '2024-01-06T00:00:00.000Z',
      updatedAt: '2024-01-06T00:00:00.000Z',
    },
  ],
};

describe('DesignerProjectsList', () => {
  it('renders project filters, rows, status badges, and edit links', () => {
    render(<DesignerProjectsList projects={projects} activeStatus="all" />);

    expect(screen.getByRole('link', { name: /all 2/i })).toHaveAttribute(
      'href',
      '/designer/projects?page=1',
    );
    expect(screen.getByRole('link', { name: /live/i })).toHaveAttribute(
      'href',
      '/designer/projects?status=published&page=1',
    );
    expect(screen.getByText('2BHK Apartment in Velachery')).toBeInTheDocument();
    expect(screen.getByText('Velachery, Chennai')).toBeInTheDocument();
    expect(screen.getByText('Apartment')).toBeInTheDocument();
    expect(screen.getByText('Villa')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Needs change')).toBeInTheDocument();
    expect(screen.getByText('Villa').closest('[data-slot="badge"]')).toHaveClass(
      'bg-feature-lighter',
      'text-feature',
    );
    expect(screen.getByText('Active').closest('[data-slot="badge"]')).toHaveClass(
      'bg-success-lighter',
      'text-success',
    );
    expect(screen.getByRole('link', { name: /edit 2bhk apartment in velachery/i })).toHaveAttribute(
      'href',
      '/designer/projects/11111111-1111-4111-8111-111111111111/edit',
    );
  });

  it('shows an empty state when no projects match', () => {
    render(
      <DesignerProjectsList
        projects={{ ...projects, items: [], total: 0, totalPages: 1 }}
        activeStatus="all"
        query="missing"
      />,
    );

    expect(screen.getByText(/no projects found/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /add new project/i })).toHaveAttribute(
      'href',
      '/designer/projects/new',
    );
  });

  it('focuses project search when pressing the slash shortcut', async () => {
    const user = userEvent.setup();
    render(<DesignerProjectsList projects={projects} activeStatus="all" />);

    await user.keyboard('/');

    expect(screen.getByPlaceholderText('Search')).toHaveFocus();
  });

  it('focuses project search when the browser reports the slash key by code', () => {
    render(<DesignerProjectsList projects={projects} activeStatus="all" />);

    fireEvent.keyDown(window, { key: 'Slash', code: 'Slash' });

    expect(screen.getByPlaceholderText('Search')).toHaveFocus();
  });
});
