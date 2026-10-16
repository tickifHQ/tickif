import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminLeadQuerySchema } from '@repo/contracts';
vi.mock('../../../src/modules/admin-visibility/repository.js', () => ({
  adminVisibilityRepository: {
    scopeExists: vi.fn(),
    report: vi.fn(),
    entities: vi.fn(),
    leads: vi.fn(),
    lead: vi.fn(),
    enquiry: vi.fn(),
    messages: vi.fn(),
    companies: vi.fn(),
  },
}));
const { adminVisibilityService: service } =
  await import('../../../src/modules/admin-visibility/service.js');
const { adminVisibilityRepository: repository } =
  await import('../../../src/modules/admin-visibility/repository.js');
const counts = {
  leads: 0,
  new: 0,
  contacted: 0,
  closed: 0,
  spam: 0,
  enquiries: 0,
  openEnquiries: 0,
  closedEnquiries: 0,
  respondedEnquiries: 0,
  progressedEnquiries: 0,
  projectViews: 0,
  profileViews: 0,
  projectsCreated: 0,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repository.scopeExists).mockResolvedValue(true);
});
describe('admin visibility service', () => {
  it('returns zero rates and zero-filled calendar days for an empty cohort', async () => {
    vi.mocked(repository.report).mockResolvedValue({ metrics: counts, activity: [] });
    const result = await service.report({ from: '2026-10-10', to: '2026-10-11' });
    expect(result.metrics).toMatchObject({ responseRate: 0, conversionRate: 0 });
    expect(result.activity).toEqual([
      { date: '2026-10-10', enquiries: 0, responded: 0, progressed: 0 },
      { date: '2026-10-11', enquiries: 0, responded: 0, progressed: 0 },
    ]);
  });
  it('uses the submission cohort denominator for actual responses and pipeline progression', async () => {
    vi.mocked(repository.report).mockResolvedValue({
      metrics: { ...counts, enquiries: 4, respondedEnquiries: 1, progressedEnquiries: 2 },
      activity: [],
    });
    const result = await service.report({ from: '2026-10-11', to: '2026-10-11' });
    expect(result.metrics).toMatchObject({ responseRate: 25, conversionRate: 50 });
  });
  it('rejects mismatched company/designer scopes instead of broadening the query', async () => {
    vi.mocked(repository.scopeExists).mockResolvedValue(false);
    await expect(
      service.leads(adminLeadQuerySchema.parse({ organizationId: 'missing' })),
    ).rejects.toMatchObject({ status: 404 });
    expect(repository.leads).not.toHaveBeenCalled();
  });
  it('returns not found for a missing lead before reading any private thread', async () => {
    vi.mocked(repository.lead).mockResolvedValue(null);
    await expect(
      service.lead('11111111-1111-4111-8111-111111111111', { page: 1, limit: 25 }),
    ).rejects.toMatchObject({ status: 404 });
    expect(repository.messages).not.toHaveBeenCalled();
  });
  it('keeps pipeline totals independent of the active stage and paginates empty lists honestly', async () => {
    vi.mocked(repository.leads).mockResolvedValue({
      items: [],
      total: 0,
      pipeline: [{ status: 'contacted', count: 4 }],
    });
    const result = await service.leads(adminLeadQuerySchema.parse({ status: 'new' }));
    expect(result).toMatchObject({
      total: 0,
      totalPages: 0,
      pipeline: { total: 4, new: 0, contacted: 4, closed: 0, spam: 0 },
    });
  });
});
