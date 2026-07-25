import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/modules/orgs/repository.js', () => ({
  orgsRepository: {
    hasMembership: vi.fn(),
    findSoleOrganizationForUser: vi.fn(),
    findMembershipRole: vi.fn(),
  },
}));

const { orgsService } = await import('../../../src/modules/orgs/service.js');
const { orgsRepository } = await import('../../../src/modules/orgs/repository.js');

describe('orgsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates membership and unambiguous legacy-session lookup to the repository', async () => {
    vi.mocked(orgsRepository.hasMembership).mockResolvedValue(true);
    vi.mocked(orgsRepository.findSoleOrganizationForUser).mockResolvedValue('org-1');

    await expect(orgsService.isMember('user-1', 'org-1')).resolves.toBe(true);
    await expect(orgsService.findSoleOrganizationForUser('user-1')).resolves.toBe('org-1');
  });

  it.each(['owner', 'admin', 'member,admin', 'owner,member'])(
    'treats %s as a write-capable Better Auth organization role',
    async (role) => {
      vi.mocked(orgsRepository.findMembershipRole).mockResolvedValue(role);

      await expect(orgsService.isWriter('user-1', 'org-1')).resolves.toBe(true);
    },
  );

  it.each([null, 'member', 'viewer'])('treats %s as read-only', async (role) => {
    vi.mocked(orgsRepository.findMembershipRole).mockResolvedValue(role);

    await expect(orgsService.isWriter('user-1', 'org-1')).resolves.toBe(false);
  });
});
