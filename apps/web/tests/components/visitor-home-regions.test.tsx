import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ListEnquiriesResponse, ListSavedProjectsResponse } from '@repo/contracts';
const mock = vi.hoisted(() => ({ suggestions: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mock.refresh }) }));
vi.mock('@/lib/visitor-home-data.server', () => ({ getSavedProjectSuggestions: mock.suggestions }));
vi.mock('@/components/showcase-card', () => ({
  ShowcaseCard: ({ project }: { project: { title: string } }) => <article>{project.title}</article>,
}));
import {
  VisitorActivityLinks,
  VisitorEnquirySummary,
  VisitorSavedSuggestions,
} from '@/components/visitor-home-regions';

const source = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'test-home',
  title: 'Test home',
  studio: 'Test studio',
  city: null,
  locality: null,
  rating: 0,
  reviewCount: 0,
  budget: null,
  tags: [],
  coverImageId: null,
  coverImageUrl: null,
  imageWidth: null,
  imageHeight: null,
};
const saved: ListSavedProjectsResponse = {
  projects: [source],
  page: 1,
  limit: 1,
  total: 4,
  totalPages: 4,
};
const enquiries: ListEnquiriesResponse = {
  items: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      designerProfile: {
        id: '22222222-2222-4222-8222-222222222222',
        displayName: 'Test studio',
        logoUrl: null,
        location: null,
      },
      referredProjectId: null,
      referredProjectTitle: null,
      subject: 'Design my home',
      description: 'A synthetic enquiry',
      templateUsed: null,
      budget: '10l-20l',
      timeline: null,
      status: 'responded',
      createdAt: '2026-10-10T00:00:00Z',
      updatedAt: '2026-10-12T00:00:00Z',
    },
  ],
  page: 1,
  limit: 1,
  total: 2,
  totalPages: 2,
};

describe('visitor home activity regions', () => {
  it('uses navigation sizing only in the desktop header', async () => {
    render(
      await VisitorActivityLinks({
        activity: Promise.resolve({ saved, enquiries }),
        counts: Promise.resolve({ total: 2, unread: 1 }),
        navigation: true,
      }),
    );
    const savedLink = screen.getByRole('link', { name: 'Saved 4' });
    expect(savedLink).toHaveClass('h-10', 'px-3', 'leading-4');
    expect(savedLink.querySelector('[data-slot=badge]')).toHaveClass(
      'text-[10px]',
      'px-1.5',
      'py-0.5',
    );
    expect(
      screen.getByRole('link', { name: 'Enquiries 2 NEW' }).querySelector('[data-slot=badge]'),
    ).toHaveClass('text-[10px]', 'leading-3');
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mock.suggestions.mockResolvedValue([]);
  });
  it('uses actual saved and enquiry totals and supported destinations', async () => {
    render(
      await VisitorActivityLinks({
        activity: Promise.resolve({ saved, enquiries }),
        counts: Promise.resolve({ total: 2, unread: 1 }),
      }),
    );
    expect(screen.getByRole('link', { name: 'Saved 4' })).toHaveAttribute(
      'href',
      '/saved-projects',
    );
    expect(screen.getByRole('link', { name: 'Enquiries 2 NEW' })).toHaveAttribute(
      'href',
      '/enquiries',
    );
    expect(screen.getByText('4')).toHaveClass('bg-foreground', 'text-background');
    expect(screen.getByText('2 NEW')).toHaveClass(
      'bg-badge-terracotta',
      'text-badge-terracotta-foreground',
    );
    expect(screen.queryByText(/following/i)).toBeNull();
  });
  it('does not pretend failed activity reads are zero', async () => {
    render(
      await VisitorActivityLinks({ activity: Promise.resolve({ saved: null, enquiries: null }) }),
    );
    expect(screen.queryByText('0')).toBeNull();
    expect(screen.getByRole('link', { name: 'Saved' })).toBeInTheDocument();
  });
  it('shows the real response state with no invented viewed or called milestones', async () => {
    render(await VisitorEnquirySummary({ activity: Promise.resolve({ saved, enquiries }) }));
    expect(screen.getByText('Responded')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      `/enquiries?enquiryId=${enquiries.items[0]!.id}`,
    );
    expect(screen.queryByText(/Viewed|Contacted|called you|NEW/)).toBeNull();
  });
  it('handles empty enquiries without inventing an activity card', async () => {
    expect(
      await VisitorEnquirySummary({
        activity: Promise.resolve({
          saved,
          enquiries: { ...enquiries, items: [], total: 0, totalPages: 0 },
        }),
      }),
    ).toBeNull();
  });
  it('shows tracked milestones and unread activity without fabricating a phone call', async () => {
    const item = {
      ...enquiries.items[0]!,
      activity: {
        viewedAt: '2026-10-11T00:00:00Z',
        contactedAt: '2026-10-12T00:00:00Z',
        lastMessageAt: '2026-10-12T00:00:00Z',
        isNew: true,
      },
      referredProjectImageUrl: 'https://images.example.com/public-cover.jpg',
    };
    render(
      await VisitorEnquirySummary({
        activity: Promise.resolve({ saved, enquiries: { ...enquiries, items: [item] } }),
      }),
    );
    expect(screen.getByRole('heading', { name: 'Contacted, complete' })).toBeInTheDocument();
    expect(screen.getByText('NEW')).toBeInTheDocument();
    expect(screen.getByText(/Messaged you/)).toBeInTheDocument();
    expect(screen.queryByText(/called/i)).toBeNull();
  });
  it('keeps failed reads retryable', async () => {
    render(await VisitorEnquirySummary({ activity: Promise.resolve({ saved, enquiries: null }) }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mock.refresh).toHaveBeenCalledOnce();
  });
  it('keeps a real enquiry visible if saved activity is unavailable', async () => {
    render(await VisitorEnquirySummary({ activity: Promise.resolve({ saved: null, enquiries }) }));
    expect(screen.getByText('Your enquiry to Test studio')).toBeInTheDocument();
  });
  it('does not fetch recommendations without a saved project', async () => {
    expect(
      await VisitorSavedSuggestions({
        activity: Promise.resolve({ saved: { ...saved, projects: [], total: 0 }, enquiries }),
      }),
    ).toBeNull();
    expect(mock.suggestions).not.toHaveBeenCalled();
  });
  it('shows the saved source and real similarity results', async () => {
    mock.suggestions.mockResolvedValue([
      { ...source, id: '44444444-4444-4444-8444-444444444444', title: 'Similar home' },
    ]);
    render(await VisitorSavedSuggestions({ activity: Promise.resolve({ saved, enquiries }) }));
    expect(
      screen.getByRole('heading', { name: 'Because you saved Test home' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveTextContent('Similar home');
  });
  it('matches the saved recommendation heading and metadata spacing with shared typography and color tokens', async () => {
    mock.suggestions.mockResolvedValue([{ ...source, title: 'Similar home' }]);
    render(
      await VisitorSavedSuggestions({
        activity: Promise.resolve({
          saved: {
            ...saved,
            projects: [{ ...source, tags: ['Brass', 'Cane'], budget: '₹10L - ₹15L' }],
          },
          enquiries,
        }),
      }),
    );
    const heading = screen.getByRole('heading', { name: 'Because you saved Test home' });
    expect(heading).toHaveClass('flex', 'flex-wrap', 'items-baseline', 'gap-x-1.5');
    expect(heading.querySelector('span')).toHaveTextContent(/^Because you saved$/);
    expect(heading.parentElement).toHaveClass('flex', 'flex-col', 'gap-0.5');
    const metadata = screen.getByText('Brass · Cane · ₹10L - ₹15L');
    expect(metadata).toHaveClass(
      'font-mono',
      'font-medium',
      'text-[11px]',
      'leading-[14px]',
      'tracking-[0.06em]',
      'uppercase',
      'text-primary',
    );
    expect(metadata).not.toHaveClass('mt-1', 'text-muted-foreground');
  });
  it('allows retry without showing fabricated recommendations', async () => {
    mock.suggestions.mockRejectedValue(new Error('Unavailable'));
    render(await VisitorSavedSuggestions({ activity: Promise.resolve({ saved, enquiries }) }));
    expect(screen.getByText('Similar projects unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('article')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mock.refresh).toHaveBeenCalledOnce();
  });
});
