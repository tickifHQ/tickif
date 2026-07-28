import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { LeadDetailResponse, ListLeadsResponse } from '@repo/contracts';
import { DesignerLeadsList } from '../../src/components/designer-leads-list';

vi.mock('next/navigation', () => ({
  usePathname: () => '/designer/leads',
  useRouter: () => ({
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

const leads: ListLeadsResponse = {
  page: 1,
  limit: 12,
  total: 3,
  totalPages: 1,
  items: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Priya Krishnan',
      city: 'Chennai',
      referredProjectTitle: '4BHK Villa in OMR',
      contactNumber: '+91 9123456789',
      budgetBand: '₹5-10L',
      status: 'contacted',
      receivedAt: '2026-01-06T00:00:00.000Z',
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Rahul Venkat',
      city: 'Bangalore',
      referredProjectTitle: '4BHK Villa in OMR',
      contactNumber: '+91 9123456789',
      budgetBand: '₹25-30L',
      status: 'closed',
      receivedAt: '2025-12-22T00:00:00.000Z',
    },
    {
      id: '44444444-4444-4444-8444-444444444444',
      name: 'Ananya Mehta',
      city: 'Mumbai',
      referredProjectTitle: '2BHK Apartment in Bandra',
      contactNumber: '+91 9000000101',
      budgetBand: '₹10-15L',
      status: 'spam',
      receivedAt: '2025-12-20T00:00:00.000Z',
    },
  ],
};

const selectedLead: LeadDetailResponse = {
  ...leads.items[0]!,
  referredProjectId: '33333333-3333-4333-8333-333333333333',
  message: 'Needs a modular kitchen quote.',
  source: 'enquiry',
  createdAt: '2026-01-06T00:00:00.000Z',
  updatedAt: '2026-01-06T00:00:00.000Z',
};

describe('DesignerLeadsList', () => {
  it('renders lead filters, API rows, and passive response status chips', () => {
    render(<DesignerLeadsList leads={leads} activeStatus="all" />);

    expect(screen.getByRole('link', { name: /all 3/i })).toHaveAttribute(
      'href',
      '/designer/leads?page=1',
    );
    expect(screen.getByRole('link', { name: /contacted/i })).toHaveAttribute(
      'href',
      '/designer/leads?status=contacted&page=1',
    );
    expect(screen.getByRole('link', { name: /new lead/i })).toHaveAttribute(
      'href',
      '/designer/leads?status=new&page=1',
    );
    expect(screen.getByText('Priya Krishnan')).toBeInTheDocument();
    expect(screen.getAllByText('4BHK Villa in OMR').length).toBeGreaterThan(0);
    const responseChips = screen
      .getAllByText(/^(Contacted|Closed|Spam)$/)
      .filter((element) => element.getAttribute('data-slot') === 'badge');
    expect(responseChips.map((chip) => chip.textContent)).toEqual(['Contacted', 'Closed', 'Spam']);
    expect(screen.queryByText(/mark as/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/backend is not available/i)).not.toBeInTheDocument();
  });

  it('shows an empty state for an empty API page', () => {
    render(
      <DesignerLeadsList
        leads={{ ...leads, items: [], total: 0, totalPages: 1 }}
        activeStatus="closed"
        query="rahul"
      />,
    );

    expect(screen.getByText(/no leads found/i)).toBeInTheDocument();
    expect(screen.getByText(/try a different search/i)).toBeInTheDocument();
  });

  it('labels the lead detail dialog for assistive technology', () => {
    render(<DesignerLeadsList leads={leads} selectedLead={selectedLead} activeStatus="all" />);

    expect(screen.getByRole('dialog', { name: /lead details/i })).toBeInTheDocument();
    expect(screen.getByText('Needs a modular kitchen quote.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass(
      'h-8',
      'bg-button-inverted',
      'text-button-inverted-foreground',
    );
  });

  it('focuses lead search when pressing the slash shortcut', async () => {
    const user = userEvent.setup();
    render(<DesignerLeadsList leads={leads} activeStatus="all" />);

    await user.keyboard('/');

    expect(screen.getByPlaceholderText('Search')).toHaveFocus();
  });
});
