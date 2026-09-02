import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../src/lib/errors.js';
import type {
  LeadDetailRecord,
  LeadListRecord,
  LeadStatusCount,
} from '../../../src/modules/leads/repository.js';

vi.mock('../../../src/modules/leads/repository.js', () => ({
  leadsRepository: {
    list: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    findProjectBranch: vi.fn(),
    budgetBandExists: vi.fn(),
    countByStatus: vi.fn(),
  },
}));

vi.mock('../../../src/modules/orgs/service.js', () => ({
  orgsService: { getCapabilities: vi.fn() },
}));

const { leadsService } = await import('../../../src/modules/leads/service.js');
const { leadsRepository } = await import('../../../src/modules/leads/repository.js');
const { orgsService } = await import('../../../src/modules/orgs/service.js');

const caller = {
  userId: 'user_1',
  isBanned: false,
  activeOrgId: 'org_1',
  activeTeamId: 'team_1',
};

const leadListRow = (overrides: Partial<LeadListRecord> = {}): LeadListRecord => ({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Priya Shah',
  city: 'mumbai',
  referredProjectTitle: 'Bandra Apartment',
  contactNumber: '+919800000001',
  budgetBandSlug: 'premium',
  status: 'new',
  receivedAt: new Date('2026-06-26T10:00:00.000Z'),
  ...overrides,
});

const leadDetailRow = (overrides: Partial<LeadDetailRecord> = {}): LeadDetailRecord => ({
  ...leadListRow(),
  organizationId: 'org_1',
  teamId: 'team_1',
  referredProjectId: '22222222-2222-4222-8222-222222222222',
  message: 'Need a renovation',
  notes: null,
  source: 'enquiry',
  createdAt: new Date('2026-06-26T10:00:00.000Z'),
  updatedAt: new Date('2026-06-26T10:00:00.000Z'),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(orgsService.getCapabilities).mockResolvedValue({ leadScope: 'full' } as never);
});

describe('leadsService.list', () => {
  it('maps list rows and passes status pagination filters', async () => {
    vi.mocked(leadsRepository.list).mockResolvedValue({ items: [leadListRow()], total: 13 });

    const result = await leadsService.list(
      { status: 'contacted', q: 'bandra', page: 2, limit: 12 },
      caller,
    );

    expect(leadsRepository.list).toHaveBeenCalledWith({
      userId: caller.userId,
      activeOrgId: caller.activeOrgId,
      activeTeamId: caller.activeTeamId,
      status: 'contacted',
      q: 'bandra',
      limit: 12,
      offset: 12,
    });
    expect(result).toMatchObject({ page: 2, limit: 12, total: 13, totalPages: 2 });
    expect(result.items[0]).toMatchObject({
      name: 'Priya Shah',
      budgetBand: 'premium',
      referredProjectTitle: 'Bandra Apartment',
      receivedAt: '2026-06-26T10:00:00.000Z',
    });
  });

  it('rejects listing without an active organization', async () => {
    await expect(
      leadsService.list({ status: 'all', page: 1, limit: 12 }, { ...caller, activeOrgId: null }),
    ).rejects.toMatchObject({ status: 422 });
    expect(leadsRepository.list).not.toHaveBeenCalled();
  });

  it('rejects listing without an active branch', async () => {
    await expect(
      leadsService.list({ status: 'all', page: 1, limit: 12 }, { ...caller, activeTeamId: null }),
    ).rejects.toMatchObject({ status: 422, message: 'No active branch selected' });
    expect(leadsRepository.list).not.toHaveBeenCalled();
  });
});

describe('leadsService.getById', () => {
  it('requires organization membership for lead reads', async () => {
    vi.mocked(leadsRepository.findById).mockResolvedValue(leadDetailRow());
    vi.mocked(orgsService.getCapabilities).mockResolvedValue(null);

    await expect(leadsService.getById(leadDetailRow().id, caller)).rejects.toBeInstanceOf(AppError);
    await expect(leadsService.getById(leadDetailRow().id, caller)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('does not expose a lead from a different active organization', async () => {
    vi.mocked(leadsRepository.findById).mockResolvedValue(
      leadDetailRow({ organizationId: 'org_2' }),
    );

    await expect(leadsService.getById(leadDetailRow().id, caller)).rejects.toMatchObject({
      status: 404,
    });
    expect(orgsService.getCapabilities).not.toHaveBeenCalled();
  });
});

describe('leadsService.counts', () => {
  it('returns every status bucket for the active organization and search', async () => {
    const counts: LeadStatusCount[] = [
      { status: 'new', count: 3 },
      { status: 'contacted', count: 4 },
      { status: 'closed', count: 2 },
    ];
    vi.mocked(leadsRepository.countByStatus).mockResolvedValue(counts);

    await expect(leadsService.counts({ q: 'bandra' }, caller)).resolves.toEqual({
      total: 9,
      new: 3,
      contacted: 4,
      closed: 2,
      spam: 0,
    });
    expect(leadsRepository.countByStatus).toHaveBeenCalledWith('org_1', 'bandra', 'team_1');
  });

  it('rejects counts without an active organization', async () => {
    await expect(leadsService.counts({}, { ...caller, activeOrgId: null })).rejects.toMatchObject({
      status: 422,
    });
    expect(leadsRepository.countByStatus).not.toHaveBeenCalled();
  });
});

describe('leadsService.update', () => {
  it('persists designer notes separately from the homeowner message', async () => {
    const updated = leadDetailRow({ notes: 'Call again on Friday.' });
    vi.mocked(leadsRepository.findById).mockResolvedValue(leadDetailRow());
    vi.mocked(leadsRepository.update).mockResolvedValue(updated);

    const result = await leadsService.update(
      leadDetailRow().id,
      { notes: 'Call again on Friday.' },
      caller,
    );

    expect(leadsRepository.update).toHaveBeenCalledWith(leadDetailRow().id, {
      notes: 'Call again on Friday.',
    });
    expect(result).toMatchObject({
      message: 'Need a renovation',
      notes: 'Call again on Friday.',
    });
  });
});

describe('leadsService.create', () => {
  it('validates organization membership, budget taxonomy, and referred project org', async () => {
    vi.mocked(orgsService.getCapabilities).mockResolvedValue({ leadScope: 'full' } as never);
    vi.mocked(leadsRepository.budgetBandExists).mockResolvedValue(true);
    vi.mocked(leadsRepository.findProjectBranch).mockResolvedValue({
      organizationId: 'org_1',
      teamId: 'team_1',
    });
    vi.mocked(leadsRepository.create).mockResolvedValue(leadDetailRow());

    const result = await leadsService.create(
      {
        name: 'Priya Shah',
        contactNumber: '+919800000001',
        budgetBandSlug: 'premium',
        referredProjectId: '22222222-2222-4222-8222-222222222222',
      },
      caller,
    );

    expect(result.id).toBe('11111111-1111-4111-8111-111111111111');
    expect(leadsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org_1',
        teamId: 'team_1',
        budgetBandSlug: 'premium',
      }),
    );
  });

  it('rejects invalid budget bands', async () => {
    vi.mocked(orgsService.getCapabilities).mockResolvedValue({ leadScope: 'full' } as never);
    vi.mocked(leadsRepository.budgetBandExists).mockResolvedValue(false);

    await expect(
      leadsService.create(
        { name: 'Priya Shah', contactNumber: '+919800000001', budgetBandSlug: 'bad' },
        caller,
      ),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('does not fall back to an arbitrary membership when no organization is active', async () => {
    await expect(
      leadsService.create(
        { name: 'Priya Shah', contactNumber: '+919800000001' },
        { ...caller, activeOrgId: null },
      ),
    ).rejects.toMatchObject({ status: 422 });
    expect(leadsRepository.create).not.toHaveBeenCalled();
  });

  it('does not create a lead in a membership other than the active organization', async () => {
    await expect(
      leadsService.create(
        {
          name: 'Priya Shah',
          contactNumber: '+919800000001',
          organizationId: 'org_2',
        },
        caller,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(leadsRepository.create).not.toHaveBeenCalled();
  });
});

describe('leadsService.countForOrganization', () => {
  it('returns total and new lead counts', async () => {
    const counts: LeadStatusCount[] = [
      { status: 'new', count: 3 },
      { status: 'contacted', count: 4 },
      { status: 'closed', count: 2 },
    ];
    vi.mocked(leadsRepository.countByStatus).mockResolvedValue(counts);

    await expect(leadsService.countForOrganization('org_1')).resolves.toEqual({
      total: 9,
      new: 3,
    });
  });
});
