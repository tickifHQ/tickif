import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  account: { role: 'designer', status: 'active', banned: false, banExpires: null },
  existing: { profile: { id: 'profile-existing' }, org: { id: 'org-existing' } },
  insert: vi.fn(),
}));

vi.mock('@repo/db', () => ({
  db: {
    transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      const chain = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn(() =>
          Object.assign(Promise.resolve([mocks.existing]), {
            for: vi.fn(async () => [mocks.account]),
          }),
        ),
      };
      return callback({ select: vi.fn(() => chain), insert: mocks.insert });
    },
  },
  schema: {
    user: { id: 'user.id' },
    designerProfile: { userId: 'profile.userId', orgId: 'profile.orgId' },
    organization: { id: 'org.id' },
  },
  eq: vi.fn(),
  and: vi.fn(),
  inArray: vi.fn(),
  sql: vi.fn(),
}));
vi.mock('../../../src/modules/search-index/repository.js', () => ({
  recordSearchProjectionEvents: vi.fn(),
}));

const { profilesRepository, DesignerOnboardingAccessDeniedError } =
  await import('../../../src/modules/profiles/repository.js');

const input: Parameters<typeof profilesRepository.onboard>[0] = {
  orgId: 'org-new',
  orgName: 'New studio',
  orgSlug: 'new-studio',
  memberId: 'member-new',
  teamId: 'team-new',
  teamMemberId: 'team-member-new',
  userId: 'user-existing',
  displayName: 'New studio',
  entityType: 'individual',
  bio: null,
  address: null,
  phone: null,
  websiteUrl: null,
  googleBusinessUrl: null,
  instagramHandle: null,
  linkedinHandle: null,
  youtubeHandle: null,
  firmType: null,
  foundedYear: null,
  staffCount: null,
  footprintIds: [],
  allowAdditionalOrganization: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(mocks.account, { role: 'designer', status: 'active', banned: false });
});

describe('onboarding after waiting for the account lock', () => {
  it('returns the profile created by the winning submission without creating another studio', async () => {
    await expect(profilesRepository.onboard(input)).resolves.toEqual({
      ...mocks.existing,
      created: false,
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it.each([
    { role: 'visitor', status: 'active', banned: false },
    { role: 'designer', status: 'active', banned: true },
    { role: 'designer', status: 'suspended', banned: false },
  ])('still rejects accounts outside the onboarding boundary: %j', async (account) => {
    Object.assign(mocks.account, account);
    await expect(profilesRepository.onboard(input)).rejects.toBeInstanceOf(
      DesignerOnboardingAccessDeniedError,
    );
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
