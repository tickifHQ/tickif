import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrganizationRetentionState } from '@repo/contracts';
import { DesignerCloseStudio } from '@/components/designer-close-studio';

const mock = vi.hoisted(() => ({
  fetchStudioRetention: vi.fn(),
  requestStudioClosure: vi.fn(),
  restoreStudio: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('@/lib/close-studio-api', () => mock);
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mock.refresh }) }));

const retention: OrganizationRetentionState = {
  organizationId: 'studio', status: 'deletion_requested',
  requestedAt: '2026-09-29T10:00:00.000Z', archiveDueAt: '2026-10-29T10:00:00.000Z',
  hardDeleteDueAt: '2026-11-29T10:00:00.000Z', delistWindowDays: 30,
  archiveWindowDays: 31, archivedAt: null, purgeRequestedAt: null,
  purgingAt: null, erasedAt: null, holdPlacedAt: null, holdReason: null, revision: 1,
};
const renderStudio = () => render(
  <DesignerCloseStudio organizationName="My studio" organizationSlug="my-studio" />,
);

describe('DesignerCloseStudio', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-09-30T10:00:00Z').getTime());
    mock.fetchStudioRetention.mockResolvedValue({ retention: null });
    mock.requestStudioClosure.mockResolvedValue({ retention });
    mock.restoreStudio.mockResolvedValue({ retention: null });
  });

  it('requires the exact slug and shows recovery after closing', async () => {
    renderStudio();
    fireEvent.click(await screen.findByRole('button', { name: 'Close studio' }));
    const dialog = screen.getByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: 'Close studio' });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'wrong' } });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'my-studio' } });
    fireEvent.click(confirm);
    expect(await screen.findByRole('button', { name: 'Restore studio' })).toBeEnabled();
    expect(mock.requestStudioClosure).toHaveBeenCalledWith('my-studio');
    expect(mock.refresh).toHaveBeenCalledOnce();
  });

  it('lets the owner restore during the recovery window even under a legal hold', async () => {
    mock.fetchStudioRetention.mockResolvedValue({ retention: { ...retention, holdPlacedAt: retention.requestedAt } });
    renderStudio();
    fireEvent.click(await screen.findByRole('button', { name: 'Restore studio' }));
    expect(await screen.findByRole('button', { name: 'Close studio' })).toBeEnabled();
    expect(mock.restoreStudio).toHaveBeenCalledOnce();
  });

  it.each(['archived', 'purge_pending', 'purging', 'erased'] as const)(
    'does not offer owner recovery for %s', async (status) => {
      mock.fetchStudioRetention.mockResolvedValue({ retention: { ...retention, status } });
      renderStudio();
      await screen.findByText('Studio closure in progress');
      expect(screen.queryByRole('button', { name: 'Restore studio' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Close studio' })).not.toBeInTheDocument();
    },
  );

  it('does not offer recovery at the deadline', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date(retention.archiveDueAt).getTime());
    mock.fetchStudioRetention.mockResolvedValue({ retention });
    renderStudio();
    await screen.findByText('The recovery window has passed');
    expect(screen.queryByRole('button', { name: 'Restore studio' })).not.toBeInTheDocument();
  });

  it('retries loading without exposing closure on failure', async () => {
    mock.fetchStudioRetention.mockRejectedValueOnce(new Error('Try again'));
    renderStudio();
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: 'Close studio' })).toBeEnabled();
  });

  it('retains the confirmation dialog and reports failed closure', async () => {
    mock.requestStudioClosure.mockRejectedValue(new Error('Closure unavailable'));
    renderStudio();
    fireEvent.click(await screen.findByRole('button', { name: 'Close studio' }));
    const dialog = screen.getByRole('alertdialog');
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'my-studio' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close studio' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Closure unavailable'));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(mock.refresh).not.toHaveBeenCalled();
  });
});
