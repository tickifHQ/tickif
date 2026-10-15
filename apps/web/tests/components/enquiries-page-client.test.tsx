import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import type { EnquiryThread } from '@/components/enquiry-thread';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EnquiriesPageClient } from '@/components/enquiries-page-client';

const mock = vi.hoisted(() => ({
  unread: true as boolean | undefined,
  watermark: '2026-10-01T00:00:00.000000Z',
}));

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('@/components/enquiry-thread', () => ({
  EnquiryThread: ({ target, onRead }: ComponentProps<typeof EnquiryThread>) => (
    <button type="button" onClick={() => onRead?.(target.id, '2026-10-01T00:00:00.000000Z')}>
      Studio reply
    </button>
  ),
}));
vi.mock('@/lib/api', () => ({
  api: {
    api: {
      enquiries: {
        mine: {
          $get: async () =>
            Response.json({
              items: [
                {
                  id: '11111111-1111-4111-8111-111111111111',
                  designerProfile: {
                    id: '22222222-2222-4222-8222-222222222222',
                    displayName: 'Oy2',
                    logoUrl: null,
                    location: null,
                  },
                  referredProjectId: null,
                  referredProjectTitle: null,
                  subject: 'A home enquiry',
                  description: 'Please discuss the project.',
                  templateUsed: null,
                  budget: '10l-20l',
                  timeline: null,
                  status: 'open',
                  activity:
                    mock.unread === undefined
                      ? undefined
                      : {
                          viewedAt: null,
                          contactedAt: null,
                          lastMessageAt: null,
                          isNew: mock.unread,
                          readThrough: mock.watermark,
                        },
                  createdAt: '2026-10-01T00:00:00Z',
                  updatedAt: '2026-10-01T00:00:00Z',
                },
              ],
              page: 1,
              limit: 12,
              total: 1,
              totalPages: 1,
            }),
        },
      },
    },
  },
}));

describe('enquiry detail spacing', () => {
  beforeEach(() => {
    mock.unread = true;
    mock.watermark = '2026-10-01T00:00:00.000000Z';
  });
  it.each([false, undefined])(
    'does not invent unread updates for read or older responses (%s)',
    async (unread) => {
      mock.unread = unread;
      render(<EnquiriesPageClient />);
      await screen.findByRole('main');
      expect(screen.queryByText('Unread updates')).toBeNull();
    },
  );
  it('keeps a newer loaded update unread when an older acknowledgement arrives', async () => {
    mock.watermark = '2026-10-01T00:00:00.000001Z';
    render(<EnquiriesPageClient />);
    await screen.findByRole('button', { name: /Oy2.*Unread updates/i });
    fireEvent.click(screen.getByRole('button', { name: 'Studio reply' }));
    expect(screen.getByText('Unread updates')).toBeInTheDocument();
  });
  it('shows the unread indicator and clears it only after a confirmed read', async () => {
    render(<EnquiriesPageClient />);
    const unread = await screen.findByRole('button', { name: /Oy2.*Unread updates/i });
    expect(unread.querySelector('svg.lucide-circle')).toHaveClass('text-primary');
    fireEvent.click(screen.getByRole('button', { name: 'Studio reply' }));
    await waitFor(() => expect(screen.queryByText('Unread updates')).toBeNull());
  });
  it('keeps the studio identity separate from the progress row', async () => {
    render(<EnquiriesPageClient />);
    const detail = await screen.findByRole('main');
    const name = within(detail).getByText('Oy2');
    expect(name.parentElement?.parentElement).toHaveClass('mt-4');
    expect(within(detail).getByText('Sent')).toBeInTheDocument();
    expect(within(detail).getByText('Studio reply')).toBeInTheDocument();
  });
});
