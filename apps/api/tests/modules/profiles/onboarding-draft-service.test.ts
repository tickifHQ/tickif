import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OnboardingDraftInput } from '@repo/contracts';

// Mock the repository — the service's draft logic is what we assert here.
vi.mock('../../../src/modules/profiles/repository.js', () => ({
  profilesRepository: {
    findDraftByUserId: vi.fn(),
    upsertDraft: vi.fn(),
    deleteDraft: vi.fn(),
  },
  // The service imports this error class from the repository module.
  DesignerOnboardingAccessDeniedError: class extends Error {},
}));

const { profilesService } = await import('../../../src/modules/profiles/service.js');
const { profilesRepository } = await import('../../../src/modules/profiles/repository.js');

const pendingVisitor = { userId: 'user-1', role: 'visitor' as const, status: 'pending' as const };
const draftInput: OnboardingDraftInput = {
  step: 'presence',
  fields: { entityType: 'individual', userName: 'Mahi', address: 'Bandra West' },
};
const draftRow = {
  userId: 'user-1',
  step: draftInput.step,
  fields: draftInput.fields,
  updatedAt: new Date('2026-02-01T00:00:00.000Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('profilesService onboarding draft (E-298)', () => {
  it('getOnboardingDraft returns null when no draft is stored', async () => {
    vi.mocked(profilesRepository.findDraftByUserId).mockResolvedValue(null);
    await expect(profilesService.getOnboardingDraft('user-1')).resolves.toBeNull();
    expect(profilesRepository.findDraftByUserId).toHaveBeenCalledWith('user-1');
  });

  it('getOnboardingDraft maps a stored row to the response shape', async () => {
    vi.mocked(profilesRepository.findDraftByUserId).mockResolvedValue(draftRow);
    await expect(profilesService.getOnboardingDraft('user-1')).resolves.toEqual({
      step: 'presence',
      fields: draftInput.fields,
      updatedAt: '2026-02-01T00:00:00.000Z',
    });
  });

  it('a pending visitor may save a draft', async () => {
    vi.mocked(profilesRepository.upsertDraft).mockResolvedValue(draftRow);
    const result = await profilesService.saveOnboardingDraft(pendingVisitor, draftInput);
    expect(profilesRepository.upsertDraft).toHaveBeenCalledWith('user-1', draftInput);
    expect(result.step).toBe('presence');
    expect(result.updatedAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('a completed designer cannot save a draft (403) and never touches the repo', async () => {
    await expect(
      profilesService.saveOnboardingDraft(
        { userId: 'user-1', role: 'designer', status: 'active' },
        draftInput,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(profilesRepository.upsertDraft).not.toHaveBeenCalled();
  });

  it('an active visitor (already onboarded elsewhere) cannot save a draft', async () => {
    await expect(
      profilesService.saveOnboardingDraft(
        { userId: 'user-1', role: 'visitor', status: 'active' },
        draftInput,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(profilesRepository.upsertDraft).not.toHaveBeenCalled();
  });

  it('clearOnboardingDraft delegates to the repository (idempotent)', async () => {
    vi.mocked(profilesRepository.deleteDraft).mockResolvedValue(undefined);
    await profilesService.clearOnboardingDraft('user-1');
    expect(profilesRepository.deleteDraft).toHaveBeenCalledWith('user-1');
  });
});
