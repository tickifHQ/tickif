import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  AdminEntityResponse,
  AdminLeadDetail,
  AdminLeadResponse,
  AdminReportResponse,
} from '@repo/contracts';
vi.mock('@/components/list-pagination', () => ({ UrlListPagination: () => <div>Pagination</div> }));
vi.mock('@/lib/api', () => ({ api: {} }));
vi.mock('@/components/admin-enquiry-cohort-chart', () => ({
  AdminEnquiryCohortChart: () => <div>Enquiry cohort chart</div>,
}));
import { AdminLeadRecord, AdminLeadsWorkspace } from '../../src/components/admin-leads-workspace';
import { AdminAnalyticsWorkspace } from '../../src/components/admin-analytics-workspace';
import { AdminVisibilityFilters } from '../../src/components/admin-visibility-filters';

const id = '11111111-1111-4111-8111-111111111111';
const timestamp = '2026-10-11T10:00:00.000Z';
const window = { from: '2026-10-01', to: '2026-10-17' };
const metrics = {
  leads: 4,
  new: 1,
  contacted: 1,
  closed: 1,
  spam: 1,
  enquiries: 4,
  openEnquiries: 2,
  closedEnquiries: 1,
  respondedEnquiries: 1,
  progressedEnquiries: 2,
  projectViews: 20,
  profileViews: 10,
  projectsCreated: 2,
  responseRate: 25,
  conversionRate: 50,
};
const lead: AdminLeadDetail = {
  id,
  name: 'Asha Rao',
  contactNumber: '+919811112222',
  budget: '10-15 lakh',
  source: 'enquiry',
  status: 'contacted',
  receivedAt: timestamp,
  company: { id: 'org-1', name: 'Alpha Studio' },
  branch: { id: 'branch-1', name: 'Mumbai' },
  designer: { id, name: 'Alpha designer' },
  assignedMember: { id: 'member-1', name: 'Lead manager' },
  project: { id, name: 'Sunlit home' },
  enquiryId: id,
  message: 'Original lead message',
  notes: 'Internal follow-up note',
  createdAt: timestamp,
  updatedAt: timestamp,
  enquiry: {
    id,
    requester: {
      id: 'visitor',
      name: 'Asha Rao',
      email: 'asha@example.com',
      phone: '+919811112222',
    },
    subject: 'Kitchen request',
    description: 'Full enquiry description',
    budget: '10-15 lakh',
    timeline: 'This winter',
    templateUsed: null,
    status: 'responded',
    viewedAt: null,
    contactedAt: timestamp,
    lastMessageAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  messages: {
    page: 1,
    limit: 25,
    total: 1,
    totalPages: 1,
    items: [
      {
        id,
        body: 'Studio response text',
        author: { id: 'manager', name: 'Lead manager' },
        createdAt: timestamp,
      },
    ],
  },
};
describe('Admin lead visibility', () => {
  it('synchronizes visible filter values after URL-driven pipeline and date navigation', () => {
    const { rerender } = render(
      <AdminVisibilityFilters action="/admin/leads" query={window} leads />,
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Search leads' }), {
      target: { value: 'Unsaved search' },
    });
    rerender(
      <AdminVisibilityFilters
        action="/admin/leads"
        query={{ from: '2026-10-11', to: '2026-10-14', status: 'contacted', q: 'Asha' }}
        leads
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Lead stage' })).toHaveValue('contacted');
    expect(screen.getByRole('textbox', { name: 'Search leads' })).toHaveValue('Asha');
    expect(screen.getByLabelText('From (India time)')).toHaveValue('2026-10-11');
    expect(screen.getByLabelText('To (inclusive)')).toHaveValue('2026-10-14');
  });
  it('synchronizes the comparison selector after company-to-designer drill-down', () => {
    const { rerender } = render(
      <AdminVisibilityFilters action="/admin/analytics" query={window} groupBy="company" />,
    );
    rerender(
      <AdminVisibilityFilters
        action="/admin/analytics"
        query={{ ...window, organizationId: 'org-1' }}
        groupBy="designer"
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Compare' })).toHaveValue('designer');
  });
  it('makes an active designer scope visible and clears it while retaining the other filters', () => {
    render(
      <AdminVisibilityFilters
        action="/admin/leads"
        query={{ ...window, organizationId: 'org-1', designerId: id, status: 'contacted' }}
        companyName="Alpha Studio"
        leads
      />,
    );
    expect(screen.getByText(/Filtered to one designer/)).toBeInTheDocument();
    const clear = new URL(
      screen.getByRole('link', { name: 'Clear designer filter' }).getAttribute('href')!,
      'http://localhost',
    );
    expect(clear.searchParams.has('designerId')).toBe(false);
    expect(Object.fromEntries(clear.searchParams)).toMatchObject({
      ...window,
      organizationId: 'org-1',
      status: 'contacted',
    });
  });
  it('renders every lead stage and keeps date, company, search and stage in drill-down links', () => {
    const result: AdminLeadResponse = {
      page: 1,
      limit: 25,
      total: 1,
      totalPages: 1,
      items: [lead],
      pipeline: { total: 4, new: 1, contacted: 1, closed: 1, spam: 1 },
      window,
    };
    render(
      <AdminLeadsWorkspace
        result={result}
        query={{ ...window, organizationId: 'org-1', q: 'Asha', page: 1, limit: 25 }}
      />,
    );
    const detail = new URL(
      screen.getByRole('link', { name: 'Asha Rao' }).getAttribute('href')!,
      'http://localhost',
    );
    expect(detail.pathname).toBe(`/admin/leads/${id}`);
    expect(Object.fromEntries(detail.searchParams)).toMatchObject({
      ...window,
      organizationId: 'org-1',
      q: 'Asha',
    });
    const pipeline = screen.getByRole('region', { name: 'Lead pipeline' });
    expect(within(pipeline).getAllByRole('link')).toHaveLength(5);
    const stage = new URL(
      within(pipeline).getByRole('link', { name: /spam/i }).getAttribute('href')!,
      'http://localhost',
    );
    expect(stage.searchParams.get('status')).toBe('spam');
    expect(stage.searchParams.get('organizationId')).toBe('org-1');
    expect(screen.getByText('Lead manager')).toBeInTheDocument();
  });
  it('shows private lead and enquiry details and messages without scheduling or mutation actions', () => {
    render(<AdminLeadRecord lead={lead} />);
    for (const text of [
      'Original lead message',
      'Internal follow-up note',
      'Full enquiry description',
      'asha@example.com',
      'Studio response text',
      'This winter',
      'Sunlit home',
    ])
      expect(screen.getByText(text, { selector: 'dd, p' })).toBeInTheDocument();
    expect(screen.getAllByText('Not recorded').length).toBeGreaterThan(0);
    expect(
      screen.queryByRole('button', { name: /send|book|confirm|contact|assign|save/i }),
    ).not.toBeInTheDocument();
  });
  it('shows honest empty states for leads without linked enquiries or messages', () => {
    render(
      <AdminLeadRecord
        lead={{
          ...lead,
          enquiryId: null,
          enquiry: null,
          messages: { items: [], page: 1, limit: 25, total: 0, totalPages: 0 },
        }}
      />,
    );
    expect(screen.getByText('This lead has no linked enquiry.')).toBeInTheDocument();
    expect(screen.getByText('No studio messages recorded.')).toBeInTheDocument();
  });
});
describe('Admin company analytics', () => {
  it('labels response and conversion measures and drills down into company, designer and leads', () => {
    const report: AdminReportResponse = {
      window,
      metrics,
      activity: [{ date: '2026-10-11', enquiries: 4, responded: 1, progressed: 2 }],
    };
    const entities: AdminEntityResponse = {
      window,
      page: 1,
      limit: 25,
      total: 1,
      totalPages: 1,
      items: [
        {
          id: 'org-1',
          name: 'Alpha Studio',
          organizationId: 'org-1',
          companyName: 'Alpha Studio',
          status: null,
          metrics,
        },
      ],
    };
    render(
      <AdminAnalyticsWorkspace
        report={report}
        entities={entities}
        query={{ ...window, page: 1, limit: 25, groupBy: 'company' }}
      />,
    );
    expect(screen.getByText(/confirmed sales and revenue are not recorded/i)).toBeInTheDocument();
    expect(screen.getByText(/historical status-only responses/i)).toBeInTheDocument();
    const company = new URL(
      screen.getByRole('link', { name: 'Alpha Studio' }).getAttribute('href')!,
      'http://localhost',
    );
    expect(Object.fromEntries(company.searchParams)).toMatchObject({
      ...window,
      organizationId: 'org-1',
      groupBy: 'designer',
    });
    expect(screen.getByRole('link', { name: /View matching leads/ })).toHaveAttribute(
      'href',
      `/admin/leads?from=${window.from}&to=${window.to}`,
    );
    expect(screen.getByText('Show daily response and conversion report')).toBeInTheDocument();
  });
});
