import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/modules/admin-activity/repository.js', () => ({
  adminActivityRepository: {
    summary: vi.fn(),
    listUsers: vi.fn(),
    listEnquiries: vi.fn(),
    userActivity: vi.fn(),
  },
}));

const { adminActivityService } = await import('../../../src/modules/admin-activity/service.js');
const { adminActivityRepository } =
  await import('../../../src/modules/admin-activity/repository.js');

beforeEach(() => vi.clearAllMocks());

describe('adminActivityService', () => {
  it('maps user activity and pagination', async () => {
    vi.mocked(adminActivityRepository.listUsers).mockResolvedValue({
      items: [
        {
          id: 'user-1',
          name: 'Asha',
          email: 'asha@example.com',
          phoneNumber: null,
          role: 'visitor',
          status: 'active',
          banned: null,
          projectViews: 3,
          profileViews: 2,
          searches: 4,
          enquiries: 1,
          createdAt: new Date('2026-09-01T10:00:00.000Z'),
          lastActiveAt: new Date('2026-09-20T12:00:00.000Z'),
        },
      ],
      total: 26,
    });

    await expect(adminActivityService.listUsers({ page: 2, limit: 25 })).resolves.toMatchObject({
      total: 26,
      totalPages: 2,
      items: [
        {
          banned: false,
          projectViews: 3,
          lastActiveAt: '2026-09-20T12:00:00.000Z',
        },
      ],
    });
  });

  it('maps enquiry participants and an optional project', async () => {
    vi.mocked(adminActivityRepository.listEnquiries).mockResolvedValue({
      items: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          requesterId: 'user-1',
          requesterName: 'Asha',
          requesterEmail: 'asha@example.com',
          designerId: '22222222-2222-4222-8222-222222222222',
          designerDisplayName: 'Studio One',
          organizationId: 'org-1',
          referredProjectId: null,
          referredProjectTitle: null,
          subject: 'Kitchen renovation',
          budget: '10-15 lakh',
          timeline: null,
          status: 'open',
          createdAt: new Date('2026-09-20T10:00:00.000Z'),
          updatedAt: new Date('2026-09-20T10:00:00.000Z'),
        },
      ],
      total: 1,
    });

    const result = await adminActivityService.listEnquiries({ page: 1, limit: 25 });
    expect(result.items[0]).toMatchObject({
      requester: { id: 'user-1', email: 'asha@example.com' },
      designer: { displayName: 'Studio One' },
      referredProject: null,
    });
  });

  it('returns each user activity stream in reverse chronological form', async () => {
    vi.mocked(adminActivityRepository.userActivity).mockResolvedValue({
      searches: [
        { endpoint: 'projects', query: 'bedroom', createdAt: new Date('2026-09-20T10:00:00.000Z') },
      ],
      projectViews: [
        {
          projectId: '33333333-3333-4333-8333-333333333333',
          title: 'Calm Bedroom',
          createdAt: new Date('2026-09-20T10:01:00.000Z'),
        },
      ],
      profileViews: [],
    });

    const result = await adminActivityService.userActivity('user-1');
    expect(result.searches[0]?.createdAt).toBe('2026-09-20T10:00:00.000Z');
    expect(result.projectViews[0]?.title).toBe('Calm Bedroom');
  });
});
