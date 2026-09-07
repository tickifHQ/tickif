import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DesignerProjectModeration } from '../../src/components/designer-project-moderation';
import { MODERATION_REASON_OPTIONS } from '@repo/contracts';

const mock = vi.hoisted(() => ({ historyGet: vi.fn() }));

vi.mock('@/lib/api', () => ({
  api: {
    api: {
      projects: {
        ':id': {
          'moderation-history': { $get: mock.historyGet },
        },
      },
    },
  },
}));

describe('DesignerProjectModeration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.historyGet.mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              action: 'request_changes',
              fromStatus: 'in_review',
              toStatus: 'changes_requested',
              actorLabel: 'Tickif Review Team',
              note: 'Add clearer room labels.',
              reasonCode: null,
              reasonCodes: ['image-quality', 'room-tagging'],
              fieldDiff: null,
              createdAt: '2026-08-01T00:00:00.000Z',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
  });

  it('surfaces changes requested feedback and loads moderation history', async () => {
    const user = userEvent.setup();
    render(
      <DesignerProjectModeration
        projectId="22222222-2222-4222-8222-222222222222"
        status="changes_requested"
        moderationNote="Add clearer room labels."
        rejectionReasonCode={null}
        rejectionReasonCodes={['image-quality', 'room-tagging']}
      />,
    );

    expect(screen.getByText('Needs Change')).toBeInTheDocument();
    expect(screen.getByText('Add clearer room labels.')).toBeInTheDocument();
    for (const option of MODERATION_REASON_OPTIONS.filter((option) =>
      ['image-quality', 'room-tagging'].includes(option.value),
    )) {
      expect(screen.getByText(option.label)).toBeInTheDocument();
      expect(screen.getByText(option.description)).toBeInTheDocument();
    }

    await user.click(screen.getByRole('button', { name: /view moderation history/i }));

    await waitFor(() => {
      expect(mock.historyGet).toHaveBeenCalledWith({
        param: { id: '22222222-2222-4222-8222-222222222222' },
      });
    });
    expect(await screen.findByText('Request Changes')).toBeInTheDocument();
    expect(screen.getByText('by Tickif Review Team')).toBeInTheDocument();
    for (const option of MODERATION_REASON_OPTIONS.filter((option) =>
      ['image-quality', 'room-tagging'].includes(option.value),
    )) {
      expect(screen.getAllByText(option.label)).toHaveLength(2);
    }
  });

  it('surfaces the rejected reason and still offers history', () => {
    render(
      <DesignerProjectModeration
        projectId="33333333-3333-4333-8333-333333333333"
        status="rejected"
        moderationNote="Portfolio mismatch."
        rejectionReasonCode="project-ownership"
      />,
    );

    expect(screen.getByText('This project was rejected')).toBeInTheDocument();
    expect(screen.getByText(MODERATION_REASON_OPTIONS.find((option) => option.value === 'project-ownership')!.label)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view moderation history/i })).toBeInTheDocument();
  });
});
