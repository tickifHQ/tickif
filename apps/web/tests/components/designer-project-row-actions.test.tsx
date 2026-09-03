import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DesignerProjectRowActions } from '../../src/components/designer-project-row-actions';

const mock = vi.hoisted(() => ({
  duplicatePost: vi.fn(),
  deleteProject: vi.fn(),
  archivePost: vi.fn(),
  restorePost: vi.fn(),
  withdrawPost: vi.fn(),
  router: {
    push: vi.fn(),
    refresh: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => mock.router,
}));

vi.mock('@/lib/api', () => ({
  api: {
    api: {
      projects: {
        ':id': {
          duplicate: {
            $post: mock.duplicatePost,
          },
          archive: {
            $post: mock.archivePost,
          },
          restore: {
            $post: mock.restorePost,
          },
          $delete: mock.deleteProject,
          withdraw: {
            $post: mock.withdrawPost,
          },
        },
      },
    },
  },
}));

describe('DesignerProjectRowActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.duplicatePost.mockResolvedValue(
      new Response(
        JSON.stringify({
          project: {
            id: '33333333-3333-4333-8333-333333333333',
            designerId: '44444444-4444-4444-8444-444444444444',
            responsibleMemberId: null,
            title: 'Copied draft',
            slug: 'copied-draft',
            description: null,
            status: 'draft',
            archiveReason: null,
            rejectionReasonCode: null,
            moderationNote: null,
            propertyTypeSlug: null,
            propertySubtypeSlug: null,
            scopeSlug: null,
            bhkSlug: null,
            sizeSqft: null,
            citySlug: null,
            localitySlug: null,
            buildingName: null,
            budgetBandSlug: null,
            completedMonth: null,
            durationMonths: null,
            coverImageId: null,
            metadata: null,
            publishedAt: null,
            submittedAt: null,
            reviewComments: [],
            createdAt: '2026-07-02T00:00:00.000Z',
            updatedAt: '2026-07-02T00:00:00.000Z',
            rooms: [],
          },
        }),
        {
          status: 201,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    mock.deleteProject.mockResolvedValue(
      new Response(JSON.stringify({ id: '11111111-1111-4111-8111-111111111111', deleted: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    mock.withdrawPost.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: '11111111-1111-4111-8111-111111111111',
          designerId: '44444444-4444-4444-8444-444444444444',
          responsibleMemberId: null,
          title: 'Warm Walnut Family Home',
          slug: 'warm-walnut-family-home',
          description: null,
          status: 'draft',
          archiveReason: null,
          rejectionReasonCode: null,
          moderationNote: null,
          propertyTypeSlug: null,
          propertySubtypeSlug: null,
          scopeSlug: null,
          bhkSlug: null,
          sizeSqft: null,
          citySlug: null,
          localitySlug: null,
          buildingName: null,
          budgetBandSlug: null,
          completedMonth: null,
          durationMonths: null,
          coverImageId: null,
          metadata: null,
          publishedAt: null,
          submittedAt: null,
          reviewComments: [],
          createdAt: '2026-07-02T00:00:00.000Z',
          updatedAt: '2026-07-02T00:00:00.000Z',
          rooms: [],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    mock.archivePost.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: '11111111-1111-4111-8111-111111111111',
          designerId: '44444444-4444-4444-8444-444444444444',
          title: 'Warm Walnut Family Home',
          slug: 'warm-walnut-family-home',
          description: null,
          status: 'archived',
          archiveReason: 'manual',
          rejectionReasonCode: null,
          moderationNote: null,
          propertyTypeSlug: null,
          propertySubtypeSlug: null,
          scopeSlug: null,
          bhkSlug: null,
          sizeSqft: null,
          citySlug: null,
          localitySlug: null,
          buildingName: null,
          budgetBandSlug: null,
          completedMonth: null,
          durationMonths: null,
          coverImageId: null,
          metadata: null,
          publishedAt: null,
          submittedAt: null,
          reviewComments: [],
          createdAt: '2026-07-02T00:00:00.000Z',
          updatedAt: '2026-07-02T00:00:00.000Z',
          rooms: [],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    mock.restorePost.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: '11111111-1111-4111-8111-111111111111',
          designerId: '44444444-4444-4444-8444-444444444444',
          title: 'Warm Walnut Family Home',
          slug: 'warm-walnut-family-home',
          description: null,
          status: 'draft',
          archiveReason: null,
          rejectionReasonCode: null,
          moderationNote: null,
          propertyTypeSlug: null,
          propertySubtypeSlug: null,
          scopeSlug: null,
          bhkSlug: null,
          sizeSqft: null,
          citySlug: null,
          localitySlug: null,
          buildingName: null,
          budgetBandSlug: null,
          completedMonth: null,
          durationMonths: null,
          coverImageId: null,
          metadata: null,
          publishedAt: null,
          submittedAt: null,
          reviewComments: [],
          createdAt: '2026-07-02T00:00:00.000Z',
          updatedAt: '2026-07-02T00:00:00.000Z',
          rooms: [],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
  });

  it('duplicates the project without navigating away from the list', async () => {
    render(
      <DesignerProjectRowActions
        projectId="11111111-1111-4111-8111-111111111111"
        projectTitle="Warm Walnut Family Home"
        projectStatus="draft"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /duplicate warm walnut family home/i }));

    await waitFor(() => {
      expect(mock.duplicatePost).toHaveBeenCalledWith({
        param: { id: '11111111-1111-4111-8111-111111111111' },
      });
    });
    expect(mock.router.push).not.toHaveBeenCalled();
    expect(mock.router.refresh).toHaveBeenCalledTimes(1);
  });

  it('restores page interactions after deleting a draft', async () => {
    render(
      <DesignerProjectRowActions
        projectId="11111111-1111-4111-8111-111111111111"
        projectTitle="Warm Walnut Family Home"
        projectStatus="draft"
        canDelete
      />,
    );

    fireEvent.pointerDown(
      screen.getByRole('button', { name: /more actions for warm walnut family home/i }),
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(screen.getByRole('menuitem', { name: /delete project/i }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(mock.deleteProject).toHaveBeenCalledWith({
        param: { id: '11111111-1111-4111-8111-111111111111' },
      });
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    expect(document.body).not.toHaveStyle({ pointerEvents: 'none' });
    expect(screen.getByRole('link', { name: /edit warm walnut family home/i })).toHaveAttribute(
      'href',
      '/designer/projects/11111111-1111-4111-8111-111111111111/edit',
    );
    await waitFor(() => {
      expect(mock.router.refresh).toHaveBeenCalledTimes(1);
    });
  });

  it('archives a project when the member has archive permission', async () => {
    render(
      <DesignerProjectRowActions
        projectId="11111111-1111-4111-8111-111111111111"
        projectTitle="Warm Walnut Family Home"
        projectStatus="draft"
        canArchive
      />,
    );

    fireEvent.pointerDown(
      screen.getByRole('button', { name: /more actions for warm walnut family home/i }),
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(screen.getByRole('menuitem', { name: /archive project/i }));

    await waitFor(() => {
      expect(mock.archivePost).toHaveBeenCalledWith({
        param: { id: '11111111-1111-4111-8111-111111111111' },
      });
      expect(mock.router.refresh).toHaveBeenCalledTimes(1);
    });
  });

  it('hides permanent delete when the member lacks delete permission', () => {
    render(
      <DesignerProjectRowActions
        projectId="11111111-1111-4111-8111-111111111111"
        projectTitle="Warm Walnut Family Home"
        projectStatus="draft"
        canArchive
      />,
    );

    fireEvent.pointerDown(
      screen.getByRole('button', { name: /more actions for warm walnut family home/i }),
      { button: 0, ctrlKey: false },
    );
    expect(screen.queryByRole('menuitem', { name: /delete project/i })).not.toBeInTheDocument();
  });

  it('restores an archived project to drafts without exposing edit or duplicate actions', async () => {
    render(
      <DesignerProjectRowActions
        projectId="11111111-1111-4111-8111-111111111111"
        projectTitle="Warm Walnut Family Home"
        projectStatus="archived"
        canArchive
      />,
    );

    expect(
      screen.queryByRole('button', { name: /duplicate warm walnut family home/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /edit warm walnut family home/i }),
    ).not.toBeInTheDocument();
    fireEvent.pointerDown(
      screen.getByRole('button', { name: /more actions for warm walnut family home/i }),
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(screen.getByRole('menuitem', { name: /restore to drafts/i }));

    await waitFor(() => {
      expect(mock.restorePost).toHaveBeenCalledWith({
        param: { id: '11111111-1111-4111-8111-111111111111' },
      });
      expect(mock.router.refresh).toHaveBeenCalledTimes(1);
    });
  });

  it('hides restore and delete for an organization-retention archive', () => {
    render(
      <DesignerProjectRowActions
        projectId="11111111-1111-4111-8111-111111111111"
        projectTitle="Warm Walnut Family Home"
        projectStatus="archived"
        archiveReason="organization_retention"
        canArchive
        canDelete
      />,
    );

    fireEvent.pointerDown(
      screen.getByRole('button', { name: /more actions for warm walnut family home/i }),
      { button: 0, ctrlKey: false },
    );

    expect(screen.queryByRole('menuitem', { name: /restore to drafts/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /delete project/i })).not.toBeInTheDocument();
  });
});
