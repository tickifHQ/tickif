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
      archiveReason: null,
      rejectionReasonCode: null,
      rejectionReasonCodes: [],
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
      archiveReason: null,
      rejectionReasonCode: null,
      rejectionReasonCodes: ['image-quality', 'room-tagging'],
      moderationNote: 'Add clearer room labels.',
      coverImageUrl: null,
      reviewComments: [],
      createdAt: '2024-01-06T00:00:00.000Z',
      updatedAt: '2024-01-06T00:00:00.000Z',
    },
  ],
};

describe('DesignerProjectsList', () => {
  it.each(['published', 'submitted'] as const)(
    'explains unavailable %s versions without promising public access',
    async (status) => {
      const user = userEvent.setup();
      render(
        <DesignerProjectsList
          projects={{
            ...projects,
            items: [
              {
                ...projects.items[0]!,
                status,
                publicAvailable: false,
                liveStatus: 'published',
                pendingChanges: status === 'submitted',
              },
            ],
          }}
          activeStatus="all"
        />,
      );
      await user.click(
        screen.getByRole('button', {
          name: status === 'published' ? 'Live details' : 'Submitted details',
        }),
      );
      const tooltip = screen.getByRole('tooltip');
      expect(tooltip).toHaveTextContent('currently unavailable to visitors');
      expect(tooltip).not.toHaveTextContent('still live');
      expect(tooltip).not.toHaveTextContent('published and available to visitors');
    },
  );

  it.each([
    ['draft', 'Draft', 'Saved privately'],
    ['submitted', 'Submitted', 'waiting for review'],
    ['in_review', 'In review', 'reviewing your submission'],
    ['published', 'Live', 'available to visitors'],
    ['changes_requested', 'Needs Change', 'Update the requested details'],
    ['rejected', 'Rejected', 'was not approved'],
    ['archived', 'Archived', 'no longer visible'],
    ['delisted', 'Delisted', 'removed from public discovery'],
    ['deleted', 'Deleted', 'has been deleted'],
  ] as const)(
    'explains %s on keyboard focus and dismisses on Escape',
    async (status, label, description) => {
      const user = userEvent.setup();
      render(
        <DesignerProjectsList
          projects={{ ...projects, items: [{ ...projects.items[0]!, status }] }}
          activeStatus="all"
        />,
      );
      const trigger = screen.getByRole('button', { name: label + ' details' });
      fireEvent.focus(trigger);
      expect(await screen.findByRole('tooltip')).toHaveTextContent(description);
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    },
  );

  it('opens project details by touch and dismisses them with Escape', async () => {
    const user = userEvent.setup();
    render(<DesignerProjectsList projects={projects} activeStatus="all" />);
    const trigger = screen.getByRole('button', { name: 'Preview 2BHK Apartment in Velachery' });
    await user.click(trigger);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Velachery, Chennai');
    expect(screen.getByRole('tooltip')).toHaveTextContent('Apartment');
    expect(screen.getByRole('tooltip')).toHaveTextContent('Last updated');
    expect(screen.getByRole('tooltip').closest('table')).toBeNull();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('explains a submitted revision while keeping the public version distinct', async () => {
    const user = userEvent.setup();
    render(
      <DesignerProjectsList
        projects={{
          ...projects,
          items: [
            {
              ...projects.items[0]!,
              status: 'submitted',
              pendingChanges: true,
              liveStatus: 'published',
            },
          ],
        }}
        activeStatus="all"
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Submitted details' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Your published version is still live.');
    expect(screen.getByRole('tooltip')).toHaveTextContent('waiting for review');
  });

  it('keeps the live badge visible while changes await review', () => {
    const pendingProject = {
      ...projects.items[0]!,
      status: 'submitted' as const,
      liveStatus: 'published' as const,
      pendingChanges: true,
      pendingStatus: 'submitted' as const,
    };
    render(
      <DesignerProjectsList
        projects={{ ...projects, items: [pendingProject], total: 1 }}
        activeStatus="all"
      />,
    );

    expect(screen.getAllByText('Live')).toHaveLength(2);
    expect(screen.getByText('Pending changes · Submitted')).toBeInTheDocument();
    expect(screen.queryByText('Submitted')).not.toBeInTheDocument();
  });

  it('keeps moderation feedback available on a live project with pending changes', () => {
    const pendingProject = {
      ...projects.items[1]!,
      liveStatus: 'published' as const,
      pendingChanges: true,
      pendingStatus: 'changes_requested' as const,
    };
    render(
      <DesignerProjectsList
        projects={{ ...projects, items: [pendingProject], total: 1 }}
        activeStatus="all"
      />,
    );

    expect(screen.getByText('Pending changes · Needs Change')).toBeInTheDocument();
    expect(screen.getByLabelText('Needs Change details')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Needs Change details' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Add clearer room labels.');
  });

  it('does not show a sort indicator when project sorting is unavailable', () => {
    render(<DesignerProjectsList projects={projects} activeStatus="all" />);

    const projectHeader = screen.getByRole('columnheader', { name: 'Project' });

    expect(projectHeader.querySelector('svg')).not.toBeInTheDocument();
  });

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
    fireEvent.click(screen.getByRole('button', { name: 'Needs Change details' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Changes needed on:');
    expect(screen.getByRole('tooltip')).toHaveTextContent('Add clearer room labels.');
    expect(screen.getByRole('tooltip')).toHaveTextContent('Image quality');
    expect(screen.getByRole('tooltip')).toHaveTextContent('Room tagging');
    expect(screen.getByRole('link', { name: /edit 2bhk apartment in velachery/i })).toHaveAttribute(
      'href',
      '/designer/projects/11111111-1111-4111-8111-111111111111/edit',
    );
  });

  it('keeps every project status reachable on narrow screens', () => {
    render(<DesignerProjectsList projects={projects} activeStatus="all" />);

    const tabStrip = screen.getByRole('link', { name: /all 2/i }).parentElement;
    expect(tabStrip).toHaveClass('max-w-full', 'overflow-x-auto');
  });

  it('renders a distinct chip for every moderation status', () => {
    const statuses = [
      'draft',
      'submitted',
      'in_review',
      'published',
      'changes_requested',
      'rejected',
      'archived',
      'delisted',
      'deleted',
    ] as const;
    const allStatuses: ListProjectsResponse = {
      ...projects,
      total: statuses.length,
      items: statuses.map((status, index) => ({
        ...projects.items[0]!,
        id: `11111111-1111-4111-8111-11111111111${index}`,
        title: `Status ${status}`,
        status,
        rejectionReasonCode: status === 'rejected' ? 'project-ownership' : null,
        rejectionReasonCodes: status === 'rejected' ? ['project-ownership'] : [],
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
    expect(screen.getAllByText('Archived')).toHaveLength(2);
    expect(screen.getByText('Delisted')).toBeInTheDocument();
    expect(screen.getByText('Deleted')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: / details$/ })).toHaveLength(9);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
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
