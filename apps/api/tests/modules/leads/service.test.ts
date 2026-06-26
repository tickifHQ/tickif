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
    updateStatus: vi.fn(),
    create: vi.fn(),
    isOrgMember: vi.fn(),
    findFirstOrganizationForUser: vi.fn(),
    findProjectOrganization: vi.fn(),
    budgetBandExists: vi.fn(),
    countByStatus: vi.fn(),
  },
}));

const { leadsService } = await import('../../../src/modules/leads/service.js');
const { leadsRepository } = await import('../../../src/modules/leads/repository.js');

const caller = {
  userId: 'user_1',
  isBanned: false,
  activeOrgId: 'org_1',
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
  referredProjectId: '22222222-2222-4222-8222-222222222222',
  message: 'Need a renovation',
  source: 'enquiry',
  createdAt: new Date('2026-06-26T10:00:00.000Z'),
  updatedAt: new Date('2026-06-26T10:00:00.000Z'),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
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
});

describe('leadsService.getById', () => {
  it('requires organization membership for lead reads', async () => {
    vi.mocked(leadsRepository.findById).mockResolvedValue(leadDetailRow());
    vi.mocked(leadsRepository.isOrgMember).mockResolvedValue(false);

    await expect(leadsService.getById(leadDetailRow().id, caller)).rejects.toBeInstanceOf(AppError);
    await expect(leadsService.getById(leadDetailRow().id, caller)).rejects.toMatchObject({
      status: 403,
    });
  });
});

describe('leadsService.create', () => {
  it('validates organization membership, budget taxonomy, and referred project org', async () => {
    vi.mocked(leadsRepository.isOrgMember).mockResolvedValue(true);
    vi.mocked(leadsRepository.budgetBandExists).mockResolvedValue(true);
    vi.mocked(leadsRepository.findProjectOrganization).mockResolvedValue('org_1');
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
    expect(leadsRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org_1',
      budgetBandSlug: 'premium',
    }));
  });

  it('rejects invalid budget bands', async () => {
    vi.mocked(leadsRepository.isOrgMember).mockResolvedValue(true);
    vi.mocked(leadsRepository.budgetBandExists).mockResolvedValue(false);

    await expect(
      leadsService.create(
        { name: 'Priya Shah', contactNumber: '+919800000001', budgetBandSlug: 'bad' },
        caller,
      ),
    ).rejects.toMatchObject({ status: 422 });
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
