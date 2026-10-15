import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  load: vi.fn(),
  viewed: vi.fn(),
  send: vi.fn(),
  read: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('@/lib/visitor-activity.actions', () => ({ refreshVisitorHomeActivity: mock.refresh }));
vi.mock('@/lib/api', () => ({
  api: {
    api: {
      leads: {
        ':id': { messages: { $get: mock.load, $post: mock.send }, viewed: { $post: mock.viewed } },
      },
      enquiries: { ':id': { messages: { $get: mock.load }, read: { $post: mock.read } } },
    },
  },
}));
import { EnquiryThread } from '@/components/enquiry-thread';
const id = '11111111-1111-4111-8111-111111111111';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
describe('enquiry thread', () => {
  afterEach(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mock.load.mockResolvedValue(
      json({ enquiryId: id, canReply: true, messages: [], hasMore: false }),
    );
    mock.viewed.mockResolvedValue(json({ acknowledged: true }));
    mock.read.mockResolvedValue(json({ acknowledged: true }));
    mock.refresh.mockResolvedValue(undefined);
    mock.send.mockResolvedValue(json({ id, body: 'Hello', createdAt: '2026-10-12T00:00:00Z' }));
  });
  it('records a mounted studio view and sends a message, keeping a stable idempotency key on retries', async () => {
    mock.send.mockRejectedValueOnce(new Error('Offline'));
    render(<EnquiryThread target={{ kind: 'lead', id }} />);
    await screen.findByLabelText('Message the visitor');
    await waitFor(() => expect(mock.viewed).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Message the visitor'), { target: { value: 'Hello' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Your draft is kept');
    expect(screen.getByLabelText('Message the visitor')).toHaveValue('Hello');
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(mock.send).toHaveBeenCalledTimes(2));
    expect(mock.send.mock.calls[0]![0].json.requestId).toBe(
      mock.send.mock.calls[1]![0].json.requestId,
    );
    await waitFor(() => expect(screen.getByLabelText('Message the visitor')).toHaveValue(''));
  });
  it('keeps requester messages read-only and acknowledges the visible response watermark', async () => {
    const onRead = vi.fn();
    mock.load.mockResolvedValue(
      json({
        enquiryId: id,
        canReply: false,
        messages: [{ id, body: 'A studio reply', createdAt: '2026-10-12T01:00:00Z' }],
        hasMore: false,
      }),
    );
    render(
      <EnquiryThread
        target={{ kind: 'visitor', id }}
        readThrough="2026-10-12T00:00:00Z"
        onRead={onRead}
      />,
    );
    expect(await screen.findByText('A studio reply')).toBeInTheDocument();
    await waitFor(() =>
      expect(mock.read).toHaveBeenCalledWith(
        { param: { id }, json: { through: '2026-10-12T01:00:00.000000Z' } },
        expect.any(Object),
      ),
    );
    expect(screen.queryByLabelText('Message the visitor')).toBeNull();
    expect(mock.viewed).not.toHaveBeenCalled();
    await waitFor(() => expect(mock.refresh).toHaveBeenCalledOnce());
    expect(onRead).toHaveBeenCalledExactlyOnceWith(id, '2026-10-12T01:00:00.000000Z');
  });
  it.each([{ acknowledged: false }, { invalid: true }])(
    'never clears an unread indicator without a validated successful acknowledgement',
    async (result) => {
      const onRead = vi.fn();
      mock.read.mockResolvedValue(json(result));
      render(
        <EnquiryThread
          target={{ kind: 'visitor', id }}
          readThrough="2026-10-12T00:00:00Z"
          onRead={onRead}
        />,
      );
      expect(await screen.findByRole('status')).toHaveTextContent('Could not mark this enquiry');
      expect(onRead).not.toHaveBeenCalled();
      expect(mock.refresh).not.toHaveBeenCalled();
    },
  );
  it('shows retryable read failures rather than an invented empty thread', async () => {
    mock.load.mockRejectedValueOnce(new Error('Offline'));
    render(<EnquiryThread target={{ kind: 'lead', id }} />);
    expect(await screen.findByRole('status')).toHaveTextContent('Could not load messages');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByLabelText('Message the visitor');
  });
  it('waits for the messages to render in a visible tab and preserves the exact loaded watermark on retry', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    mock.load.mockImplementation(async () =>
      json({
        enquiryId: id,
        canReply: false,
        hasMore: false,
        readThrough: '2026-10-12T01:00:00.123457Z',
        messages: [
          { id, body: 'The newest loaded studio reply', createdAt: '2026-10-12T01:00:00.123Z' },
        ],
      }),
    );
    mock.read.mockResolvedValueOnce(json({}, 503));
    render(
      <EnquiryThread target={{ kind: 'visitor', id }} readThrough="2026-10-12T01:00:00.123456Z" />,
    );
    await screen.findByText('The newest loaded studio reply');
    expect(mock.read).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    await act(async () => fireEvent(document, new Event('visibilitychange')));
    expect(await screen.findByRole('status')).toHaveTextContent('Could not mark this enquiry');
    expect(mock.refresh).not.toHaveBeenCalled();
    expect(mock.read.mock.calls[0]![0].json.through).toBe('2026-10-12T01:00:00.123457Z');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(mock.refresh).toHaveBeenCalledOnce());
    expect(mock.read.mock.calls[1]![0].json.through).toBe('2026-10-12T01:00:00.123457Z');
  });
  it('does not show a reply form for closed or read-only threads', async () => {
    mock.load.mockResolvedValue(
      json({ enquiryId: id, canReply: false, messages: [], hasMore: false }),
    );
    render(<EnquiryThread target={{ kind: 'lead', id }} />);
    await screen.findByText('No studio messages yet.');
    expect(screen.queryByLabelText('Message the visitor')).toBeNull();
  });
});
