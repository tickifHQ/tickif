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
  total: 2,
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
  it('renders lead filters and API rows without exposing backend status copy', () => {
    render(<DesignerLeadsList leads={leads} activeStatus="all" />);

    expect(screen.getByRole('link', { name: /all 2/i })).toHaveAttribute(
      'href',
      '/designer/leads?page=1',
    );
    expect(screen.getByRole('link', { name: /contacted/i })).toHaveAttribute(
      'href',
      '/designer/leads?status=contacted&page=1',
    );
    expect(screen.getByText('Priya Krishnan')).toBeInTheDocument();
    expect(screen.getAllByText('4BHK Villa in OMR').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/mark as/i).length).toBeGreaterThan(0);
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
