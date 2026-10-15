import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { visitorFeedFilters, type VisitorFeedPreferences } from '@repo/contracts';
import { VisitorCustomizationDialog } from '../../src/components/visitor-customization-dialog';

const mock = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
  taxonomy: vi.fn(),
  search: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  assign: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mock.replace, refresh: mock.refresh }),
}));
vi.mock('@/lib/auth-client', () => ({ authClient: { getSession: vi.fn() } }));
vi.mock('@/lib/api', () => ({
  api: {
    api: {
      visitors: { me: { 'feed-preferences': { $get: mock.get, $put: mock.save } } },
      taxonomy: { terms: { $get: mock.taxonomy } },
      search: { $get: mock.search },
    },
  },
}));

const original = { homeType: '3-bhk', citySlug: null, localitySlug: null } as const;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('location', { pathname: '/home', search: '?feed=custom', assign: mock.assign });
  mock.get.mockImplementation(async () =>
    Response.json({ preferences: original, filters: visitorFeedFilters(original) }),
  );
  mock.taxonomy.mockImplementation(async () => Response.json({ terms: [] }));
  mock.search.mockResolvedValue(new Response(null, { status: 503 }));
  mock.save.mockImplementation(async ({ json }: { json: VisitorFeedPreferences }) =>
    Response.json({ preferences: json, filters: visitorFeedFilters(json) }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('visitor customization dialog', () => {
  it('loads only on open, preserves preferences on Cancel and discards the draft on reopen', async () => {
    const user = userEvent.setup();
    render(<VisitorCustomizationDialog />);
    const trigger = screen.getByRole('button', { name: 'Edit customization' });
    expect(mock.get).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(trigger);
    expect(document.querySelector('[data-slot="dialog-overlay"]')).toHaveClass(
      'bg-account-menu-overlay',
    );
    await screen.findByRole('button', { name: 'Save changes' });
    expect(screen.getByRole('button', { name: 'Close customization' })).toHaveFocus();
    expect(screen.getByRole('button', { name: '3 BHK' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Villa' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(trigger).toHaveFocus();
    expect(mock.save).not.toHaveBeenCalled();
    expect(mock.replace).not.toHaveBeenCalled();
    await user.click(trigger);
    await screen.findByRole('button', { name: 'Save changes' });
    expect(screen.getByRole('button', { name: '3 BHK' })).toHaveAttribute('aria-pressed', 'true');
    expect(mock.get).toHaveBeenCalledTimes(2);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it('updates the feed through client navigation after saving, without a full reload', async () => {
    const user = userEvent.setup();
    render(<VisitorCustomizationDialog />);
    await user.click(screen.getByRole('button', { name: 'Edit customization' }));
    await user.click(await screen.findByRole('button', { name: 'Villa' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(mock.replace).toHaveBeenCalledWith(
        '/home?feed=custom&propertyType=residential&propertySubtype=villa',
        { scroll: false },
      ),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mock.assign).not.toHaveBeenCalled();
  });

  it('allows editing a skipped form and ignores preference reads that finish after closing', async () => {
    let finishRead!: (response: Response) => void;
    mock.get.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finishRead = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<VisitorCustomizationDialog />);
    const trigger = screen.getByRole('button', { name: 'Edit customization' });
    await user.click(trigger);
    expect(screen.getByRole('status')).toHaveTextContent('Loading your customization');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await act(async () =>
      finishRead(Response.json({ preferences: original, filters: visitorFeedFilters(original) })),
    );
    mock.get.mockResolvedValueOnce(Response.json({ preferences: null, filters: {} }));
    await user.click(trigger);
    await screen.findByRole('button', { name: 'Save changes' });
    expect(screen.getByRole('button', { name: '3 BHK' })).toHaveAttribute('aria-pressed', 'false');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mock.refresh).toHaveBeenCalledOnce());
    expect(mock.save).toHaveBeenCalledWith({
      json: { homeType: null, citySlug: null, localitySlug: null },
    });
  });

  it('refreshes a same-URL save so server defaults stay current', async () => {
    vi.stubGlobal('location', {
      pathname: '/home',
      search: '?feed=custom&bhk=3-bhk',
      assign: mock.assign,
    });
    const user = userEvent.setup();
    render(<VisitorCustomizationDialog />);
    await user.click(screen.getByRole('button', { name: 'Edit customization' }));
    await user.click(await screen.findByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mock.refresh).toHaveBeenCalledOnce());
    expect(mock.replace).not.toHaveBeenCalled();
  });

  it.each([new Response(null, { status: 503 }), Response.json({ invalid: true })])(
    'does not expose an empty editable form on a failed or malformed preference read',
    async (response) => {
      mock.get.mockResolvedValueOnce(response);
      const user = userEvent.setup();
      render(<VisitorCustomizationDialog />);
      await user.click(screen.getByRole('button', { name: 'Edit customization' }));
      await screen.findByRole('alert');
      expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Retry' }));
      await screen.findByRole('button', { name: 'Save changes' });
      expect(screen.getByRole('button', { name: '3 BHK' })).toHaveAttribute('aria-pressed', 'true');
    },
  );

  it('retains the draft on save failure and prevents dismissal and duplicate submissions while saving', async () => {
    let resolveSave!: (response: Response) => void;
    mock.save.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<VisitorCustomizationDialog />);
    await user.click(screen.getByRole('button', { name: 'Edit customization' }));
    await user.click(await screen.findByRole('button', { name: 'Villa' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close customization' })).toBeDisabled();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(mock.save).toHaveBeenCalledOnce();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await act(async () =>
      resolveSave(Response.json({ error: { message: 'Retry saving' } }, { status: 503 })),
    );
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Villa' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    expect(mock.replace).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mock.replace).toHaveBeenCalledOnce());
  });
});
