import { render, screen, waitFor, within } from '@testing-library/react';
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

  // E-279: the moderation history now opens in the established right-side drawer.
  describe('moderation history drawer (E-279)', () => {
    function renderModeration() {
      return render(
        <DesignerProjectModeration
          projectId="22222222-2222-4222-8222-222222222222"
          status="rejected"
          moderationNote="Portfolio mismatch."
          rejectionReasonCode="project-ownership"
        />,
      );
    }

    it('opens a dialog drawer with the complete timeline and a close control', async () => {
      const user = userEvent.setup();
      renderModeration();

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /view moderation history/i }));

      const drawer = await screen.findByRole('dialog');
      expect(within(drawer).getByText('Moderation history')).toBeInTheDocument();
      expect(await screen.findByText('Request Changes')).toBeInTheDocument();
      // Radix DialogContent renders an accessible Close control.
      expect(within(drawer).getByRole('button', { name: /close/i })).toBeInTheDocument();
    });

    it('closes via the close control and keeps the trigger available for focus return', async () => {
      const user = userEvent.setup();
      renderModeration();

      const trigger = screen.getByRole('button', { name: /view moderation history/i });
      await user.click(trigger);
      const drawer = await screen.findByRole('dialog');

      await user.click(within(drawer).getByRole('button', { name: /close/i }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      // Focus must return to the opener so keyboard users keep their place in
      // the long upload form (onCloseAutoFocus restores it since the opener is
      // not a DialogTrigger).
      await waitFor(() => expect(trigger).toHaveFocus());
    });

    it('closes when Escape is pressed and returns focus to the opener', async () => {
      const user = userEvent.setup();
      renderModeration();

      const trigger = screen.getByRole('button', { name: /view moderation history/i });
      await user.click(trigger);
      await screen.findByRole('dialog');

      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await waitFor(() => expect(trigger).toHaveFocus());
    });

    it('refresh performs a real refetch and keeps existing history visible while pending', async () => {
      const user = userEvent.setup();
      renderModeration();

      await user.click(screen.getByRole('button', { name: /view moderation history/i }));
      await screen.findByText('Request Changes');
      expect(mock.historyGet).toHaveBeenCalledTimes(1);

      // Make the refresh hang so we can observe the pending state.
      const refreshControls: { resolve: ((value: Response) => void) | null } = { resolve: null };
      mock.historyGet.mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            refreshControls.resolve = resolve;
          }),
      );

      await user.click(screen.getByRole('button', { name: /refresh moderation history/i }));

      // Real refetch was issued...
      await waitFor(() => expect(mock.historyGet).toHaveBeenCalledTimes(2));
      // ...and the previously loaded event stays visible during the request.
      expect(screen.getByText('Request Changes')).toBeInTheDocument();

      refreshControls.resolve?.(
        new Response(
          JSON.stringify({
            items: [
              {
                id: '99999999-9999-4999-8999-999999999999',
                action: 'reject',
                fromStatus: 'in_review',
                toStatus: 'rejected',
                actorLabel: 'Tickif Review Team',
                note: 'Rejected after review.',
                reasonCode: null,
                reasonCodes: ['project-ownership'],
                fieldDiff: null,
                createdAt: '2026-08-02T00:00:00.000Z',
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

      expect(await screen.findByText('Reject')).toBeInTheDocument();
    });

    it('shows an empty state when there are no moderation events', async () => {
      const user = userEvent.setup();
      mock.historyGet.mockResolvedValue(
        new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
      renderModeration();

      await user.click(screen.getByRole('button', { name: /view moderation history/i }));

      expect(await screen.findByText(/no moderation actions yet/i)).toBeInTheDocument();
    });

    it('shows an error with a retry action that refetches', async () => {
      const user = userEvent.setup();
      mock.historyGet.mockResolvedValueOnce(new Response('nope', { status: 500 }));
      renderModeration();

      await user.click(screen.getByRole('button', { name: /view moderation history/i }));

      expect(await screen.findByText(/could not load moderation history/i)).toBeInTheDocument();

      // Retry succeeds using the default (beforeEach) mock.
      await user.click(screen.getByRole('button', { name: /try again/i }));
      expect(await screen.findByText('Request Changes')).toBeInTheDocument();
    });
  });
});
