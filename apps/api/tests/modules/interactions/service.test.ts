import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../src/lib/errors.js';

vi.mock('../../../src/modules/interactions/repository.js', () => ({
  interactionsRepository: {
    findPublicProjectOrgId: vi.fn(),
    findActiveDesignerOrgId: vi.fn(),
    isOrgMember: vi.fn(),
    insertViewEvent: vi.fn(),
  },
}));

const { interactionsService } = await import('../../../src/modules/interactions/service.js');
const { interactionsRepository } = await import('../../../src/modules/interactions/repository.js');

const identity = {
  eventKey: '11111111-1111-4111-8111-111111111111',
  anonymousId: '22222222-2222-4222-8222-222222222222',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(interactionsRepository.findPublicProjectOrgId).mockResolvedValue('org_1');
  vi.mocked(interactionsRepository.findActiveDesignerOrgId).mockResolvedValue('org_1');
  vi.mocked(interactionsRepository.isOrgMember).mockResolvedValue(false);
  vi.mocked(interactionsRepository.insertViewEvent).mockResolvedValue(true);
});

describe('interactionsService.recordView', () => {
  it('records a project view with authenticated identity', async () => {
    const result = await interactionsService.recordView({
      actorUserId: 'user_1',
      event: {
        ...identity,
        type: 'project_view',
        projectId: '33333333-3333-4333-8333-333333333333',
      },
    });

    expect(result).toEqual({ recorded: true });
    expect(interactionsRepository.insertViewEvent).toHaveBeenCalledWith({
      ...identity,
      type: 'project_view',
      projectId: '33333333-3333-4333-8333-333333333333',
      designerProfileId: null,
      actorUserId: 'user_1',
    });
  });

  it('records an active-profile view with its authenticated actor', async () => {
    await expect(
      interactionsService.recordView({
        actorUserId: 'user_2',
        event: {
          ...identity,
          type: 'profile_view',
          designerProfileId: '44444444-4444-4444-8444-444444444444',
        },
      }),
    ).resolves.toEqual({ recorded: true });

    expect(interactionsRepository.insertViewEvent).toHaveBeenCalledWith({
      ...identity,
      type: 'profile_view',
      designerProfileId: '44444444-4444-4444-8444-444444444444',
      projectId: null,
      actorUserId: 'user_2',
    });
  });

  it('returns the repository idempotency result', async () => {
    vi.mocked(interactionsRepository.insertViewEvent).mockResolvedValue(false);

    await expect(
      interactionsService.recordView({
        actorUserId: 'user_1',
        event: {
          ...identity,
          type: 'project_view',
          projectId: '33333333-3333-4333-8333-333333333333',
        },
      }),
    ).resolves.toEqual({ recorded: false });
  });

  it('does not record views from members of the target organization', async () => {
    vi.mocked(interactionsRepository.isOrgMember).mockResolvedValue(true);

    await expect(
      interactionsService.recordView({
        actorUserId: 'user_1',
        event: {
          ...identity,
          type: 'project_view',
          projectId: '33333333-3333-4333-8333-333333333333',
        },
      }),
    ).resolves.toEqual({ recorded: false });
    expect(interactionsRepository.insertViewEvent).not.toHaveBeenCalled();
  });

  it('hides non-public projects and inactive profiles before inserting', async () => {
    vi.mocked(interactionsRepository.findPublicProjectOrgId).mockResolvedValue(null);
    vi.mocked(interactionsRepository.findActiveDesignerOrgId).mockResolvedValue(null);

    await expect(
      interactionsService.recordView({
        actorUserId: 'user_1',
        event: {
          ...identity,
          type: 'project_view',
          projectId: '33333333-3333-4333-8333-333333333333',
        },
      }),
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      interactionsService.recordView({
        actorUserId: 'user_1',
        event: {
          ...identity,
          type: 'profile_view',
          designerProfileId: '44444444-4444-4444-8444-444444444444',
        },
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(interactionsRepository.insertViewEvent).not.toHaveBeenCalled();
  });
});
