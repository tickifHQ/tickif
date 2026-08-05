import { render, screen } from '@testing-library/react';
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
      rejectionReasonCode: null,
      moderationNote: null,
      coverImageUrl: null,
      reviewComments: [],
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
      rejectionReasonCode: null,
      moderationNote: 'Add clearer room labels.',
      coverImageUrl: null,
      reviewComments: [],
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
    expect(screen.getAllByText('Live')).toHaveLength(2);
    expect(screen.getByText('Needs Change')).toBeInTheDocument();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Changes needed on:');
    expect(screen.getByRole('tooltip')).toHaveTextContent('Add clearer room labels.');
    expect(screen.getByRole('link', { name: /edit 2bhk apartment in velachery/i })).toHaveAttribute(
      'href',
      '/designer/projects/11111111-1111-4111-8111-111111111111/edit',
    );
  });

  it('renders a distinct chip for every moderation status', () => {
    const statuses = [
      'draft',
      'submitted',
      'in_review',
      'published',
      'changes_requested',
      'rejected',
    ] as const;
    const allStatuses: ListProjectsResponse = {
      ...projects,
      total: statuses.length,
      items: statuses.map((status, index) => ({
        ...projects.items[0]!,
        id: `11111111-1111-4111-8111-11111111111${index}`,
        title: `Status ${status}`,
        status,
        rejectionReasonCode: status === 'rejected' ? 'portfolio-mismatch' : null,
        moderationNote: status === 'changes_requested' ? 'Update the room labels.' : null,
      })),
    };

    render(<DesignerProjectsList projects={allStatuses} activeStatus="all" />);

    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Submitted')).toBeInTheDocument();
    expect(screen.getAllByText('In review')).toHaveLength(2);
    expect(screen.getAllByText('Live')).toHaveLength(2);
    expect(screen.getByText('Needs Change')).toBeInTheDocument();
    expect(screen.getByText('Rejected')).toBeInTheDocument();
    expect(screen.getAllByRole('tooltip')).toHaveLength(2);
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
});
