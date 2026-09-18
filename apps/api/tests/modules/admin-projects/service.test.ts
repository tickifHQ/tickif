import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AdminImageRecord,
  AdminModerationEventRecord,
  AdminProjectRecord,
  AdminReviewCommentRecord,
} from '../../../src/modules/admin-projects/repository.js';

vi.mock('../../../src/modules/admin-projects/repository.js', () => ({
  adminProjectsRepository: {
    list: vi.fn(),
    findById: vi.fn(),
    listRooms: vi.fn(),
    listImages: vi.fn(),
    getReadyImageCounts: vi.fn(),
    listHistory: vi.fn(),
    listReviewComments: vi.fn(),
    hasUnresolvedReviewComments: vi.fn(),
    createReviewComment: vi.fn(),
    updateReviewComment: vi.fn(),
    correctMetadata: vi.fn(),
  },
}));

vi.mock('../../../src/modules/projects/service.js', () => ({
  buildCompleteness: vi.fn(),
  transitionProject: vi.fn(),
  validateProjectTaxonomy: vi.fn(),
}));

vi.mock('@repo/storage', () => ({
  presignDownload: vi.fn(),
}));

const { adminProjectsService } = await import('../../../src/modules/admin-projects/service.js');
const { adminProjectsRepository } =
  await import('../../../src/modules/admin-projects/repository.js');
const { buildCompleteness, transitionProject, validateProjectTaxonomy } =
  await import('../../../src/modules/projects/service.js');
const { presignDownload } = await import('@repo/storage');

const repo = vi.mocked(adminProjectsRepository);
const completeness = vi.mocked(buildCompleteness);
const transition = vi.mocked(transitionProject);
const validateTaxonomy = vi.mocked(validateProjectTaxonomy);
const signDownload = vi.mocked(presignDownload);

const admin = {
  userId: 'admin-1',
  userRole: 'admin',
  isBanned: false,
};
const otherAdmin = {
  userId: 'admin-2',
  userRole: 'admin',
  isBanned: false,
};
const superadmin = {
  userId: 'superadmin-1',
  userRole: 'superadmin',
  isBanned: false,
};

function project(overrides: Partial<AdminProjectRecord> = {}): AdminProjectRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    designerId: '22222222-2222-4222-8222-222222222222',
    responsibleMemberId: null,
    designerName: 'Review Studio',
    title: 'Complete project',
    slug: 'complete-project',
    description: null,
    status: 'in_review',
    archiveReason: null,
    propertyTypeSlug: 'residential',
    propertySubtypeSlug: null,
    scopeSlug: 'full-home',
    bhkSlug: null,
    sizeSqft: null,
    citySlug: 'mumbai',
    localitySlug: null,
    buildingName: null,
    budgetBandSlug: 'premium',
    coverImageId: null,
    completedMonth: null,
    durationMonths: null,
    metadata: {},
    publishedAt: null,
    submittedAt: new Date('2026-07-20T10:00:00.000Z'),
    reviewedBy: admin.userId,
    reviewStartedAt: new Date('2026-07-20T10:05:00.000Z'),
    rejectionReasonCode: null,
    rejectionReasonCodes: [],
    moderationNote: null,
    featuredAt: null,
    moderationRevision: 0,
    createdAt: new Date('2026-07-20T09:00:00.000Z'),
    updatedAt: new Date('2026-07-20T10:05:00.000Z'),
    ...overrides,
  };
}

function image(overrides: Partial<AdminImageRecord> = {}): AdminImageRecord {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    projectId: '11111111-1111-4111-8111-111111111111',
    roomId: '44444444-4444-4444-8444-444444444444',
    originalKey: 'originals/project/image.jpg',
    contentType: 'image/jpeg',
    derivatives: [],
    themeSlugs: ['modern'],
    materialSlugs: [],
    finishSlugs: ['veneer'],
    tagSlugs: [],
    width: 1600,
    height: 1200,
    phash: '0000000000000000',
    duplicateOfImageId: null,
    duplicateDistance: null,
    duplicateCheckedAt: new Date('2026-07-20T09:35:00.000Z'),
    failureReason: null,
    status: 'ready',
    sortOrder: 0,
    createdAt: new Date('2026-07-20T09:30:00.000Z'),
    updatedAt: new Date('2026-07-20T09:35:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  completeness.mockReturnValue({
    complete: true,
    score: 100,
    missing: [],
    requirements: [],
  });
  repo.listReviewComments.mockResolvedValue([]);
  repo.hasUnresolvedReviewComments.mockResolvedValue(false);
});

describe('adminProjectsService', () => {
  const reviewComment = (
    overrides: Partial<AdminReviewCommentRecord> = {},
  ): AdminReviewCommentRecord => ({
    id: '55555555-5555-4555-8555-555555555555',
    projectId: project().id,
    authorId: admin.userId,
    body: 'Add a wider kitchen photo.',
    status: 'unresolved',
    createdAt: new Date('2026-08-04T08:00:00.000Z'),
    updatedAt: new Date('2026-08-04T08:00:00.000Z'),
    ...overrides,
  });

  it('creates a masked review comment on a claimed in-review project', async () => {
    repo.findById.mockResolvedValue(project());
    repo.createReviewComment.mockResolvedValue(reviewComment());

    const result = await adminProjectsService.createReviewComment(
      project().id,
      { body: 'Add a wider kitchen photo.' },
      admin,
    );

    expect(repo.createReviewComment).toHaveBeenCalledWith({
      projectId: project().id,
      authorId: admin.userId,
      body: 'Add a wider kitchen photo.',
      expectedStatus: 'in_review',
      expectedReviewerId: admin.userId,
    });
    expect(result).toMatchObject({ authorLabel: 'Tickif Review Team', status: 'unresolved' });
    expect(result).not.toHaveProperty('authorId');
  });

  // E-270: the admin moderation detail must use the SAME masked actor-label
  // semantics as the designer-facing history — designer self-service actions read
  // as "Designer", reviewer verdicts stay "Tickif Review Team". Never a real id.
  it('masks moderation history actors consistently: designer actions vs reviewer verdicts', async () => {
    const moderationEvent = (
      overrides: Partial<AdminModerationEventRecord> = {},
    ): AdminModerationEventRecord => ({
      id: '66666666-6666-4666-8666-666666666666',
      projectId: project().id,
      actorUserId: 'user-1',
      action: 'submit',
      fromStatus: 'draft',
      toStatus: 'submitted',
      note: null,
      reasonCode: null,
      reasonCodes: [],
      fieldDiff: null,
      createdAt: new Date('2026-08-04T08:00:00.000Z'),
      ...overrides,
    });

    repo.findById.mockResolvedValue(project());
    repo.listRooms.mockResolvedValue([]);
    repo.listImages.mockResolvedValue([]);
    repo.getReadyImageCounts.mockResolvedValue({ imageCount: 3, taggedImageCount: 3 });
    repo.listReviewComments.mockResolvedValue([]);
    repo.listHistory.mockResolvedValue([
      moderationEvent({ action: 'submit', fromStatus: 'draft', toStatus: 'submitted' }),
      moderationEvent({
        action: 'resubmit',
        fromStatus: 'changes_requested',
        toStatus: 'submitted',
      }),
      moderationEvent({ action: 'withdraw', fromStatus: 'submitted', toStatus: 'draft' }),
      moderationEvent({ action: 'start_review', fromStatus: 'submitted', toStatus: 'in_review' }),
      moderationEvent({
        action: 'request_changes',
        fromStatus: 'in_review',
        toStatus: 'changes_requested',
      }),
      moderationEvent({ action: 'reject', fromStatus: 'in_review', toStatus: 'rejected' }),
      moderationEvent({ action: 'publish', fromStatus: 'in_review', toStatus: 'published' }),
    ]);

    const result = await adminProjectsService.getById(project().id);
    const labelByAction = new Map(
      result.history.map((item) => [item.action, item.actorLabel] as const),
    );
    expect(labelByAction.get('submit')).toBe('Designer');
    expect(labelByAction.get('resubmit')).toBe('Designer');
    expect(labelByAction.get('withdraw')).toBe('Designer');
    expect(labelByAction.get('start_review')).toBe('Tickif Review Team');
    expect(labelByAction.get('request_changes')).toBe('Tickif Review Team');
    expect(labelByAction.get('reject')).toBe('Tickif Review Team');
    expect(labelByAction.get('publish')).toBe('Tickif Review Team');
    for (const item of result.history) {
      expect(item).not.toHaveProperty('actorUserId');
    }
  });

  it('lets the assigned reviewer resolve one comment after requesting changes', async () => {
    repo.findById.mockResolvedValue(project({ status: 'changes_requested' }));
    repo.updateReviewComment.mockResolvedValue(reviewComment({ status: 'resolved' }));

    const result = await adminProjectsService.updateReviewComment(
      project().id,
      reviewComment().id,
      { status: 'resolved' },
      admin,
    );

    expect(repo.updateReviewComment).toHaveBeenCalledWith({
      projectId: project().id,
      commentId: reviewComment().id,
      status: 'resolved',
      expectedStatus: 'changes_requested',
      expectedReviewerId: admin.userId,
    });
    expect(result.status).toBe('resolved');
  });

  it('blocks publishing while a review comment remains unresolved', async () => {
    repo.findById.mockResolvedValue(project());
    repo.hasUnresolvedReviewComments.mockResolvedValue(true);

    await expect(adminProjectsService.publish(project().id, admin)).rejects.toMatchObject({
      status: 409,
      message: 'Resolve outstanding review comments before publishing',
    });
    expect(completeness).not.toHaveBeenCalled();
    expect(transition).not.toHaveBeenCalled();
  });

  it('scopes the in-review queue to the current admin but lets superadmins see all claims', async () => {
    repo.list.mockResolvedValue({ items: [], total: 0 });
    const query = { status: 'in_review', sort: 'oldest', page: 1, limit: 25 } as const;

    await adminProjectsService.list(query, admin);
    expect(repo.list).toHaveBeenLastCalledWith(query, admin.userId);

    await adminProjectsService.list(query, superadmin);
    expect(repo.list).toHaveBeenLastCalledWith(query, undefined);
  });

  it('blocks moderation actions from an admin who does not own the claim', async () => {
    repo.findById.mockResolvedValue(project());

    await expect(adminProjectsService.publish(project().id, otherAdmin)).rejects.toMatchObject({
      status: 403,
      message: 'Project is assigned to another reviewer',
    });
    await expect(
      adminProjectsService.requestChanges(
        project().id,
        { note: 'Needs work', reasonCodes: ['other'] },
        otherAdmin,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      adminProjectsService.reject(
        project().id,
        { note: 'Not suitable', reasonCodes: ['image-quality'] },
        otherAdmin,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      adminProjectsService.correct(project().id, { title: 'Other title' }, otherAdmin),
    ).rejects.toMatchObject({ status: 403 });
    expect(transition).not.toHaveBeenCalled();
    expect(repo.correctMetadata).not.toHaveBeenCalled();
  });

  it('rechecks completeness immediately before publishing', async () => {
    repo.findById.mockResolvedValue(project());
    repo.getReadyImageCounts.mockResolvedValue({ imageCount: 2, taggedImageCount: 2 });
    completeness.mockReturnValue({
      complete: false,
      score: 86,
      missing: ['at-least-three-photos'],
      requirements: [],
    });

    await expect(adminProjectsService.publish(project().id, admin)).rejects.toMatchObject({
      status: 409,
      message: 'Project is incomplete and cannot be published',
    });
    expect(transition).not.toHaveBeenCalled();
  });

  it('publishes against the same moderation revision used for completeness', async () => {
    const existing = project({ moderationRevision: 7 });
    repo.findById.mockResolvedValue(existing);
    repo.getReadyImageCounts.mockResolvedValue({ imageCount: 3, taggedImageCount: 3 });
    transition.mockResolvedValue(project({ status: 'published' }));
    const getById = vi.spyOn(adminProjectsService, 'getById').mockResolvedValue({} as never);

    await adminProjectsService.publish(existing.id, admin);

    expect(transition).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: existing.id,
        toStatus: 'published',
        expectedModerationRevision: 7,
        requireNoUnresolvedReviewComments: true,
      }),
      admin,
    );
    getById.mockRestore();
  });

  it('checks the source status before start-review and unpublish', async () => {
    repo.findById.mockResolvedValueOnce(project({ status: 'published' }));
    await expect(adminProjectsService.startReview(project().id, admin)).rejects.toMatchObject({
      status: 409,
      code: 'invalid_transition',
    });

    repo.findById.mockResolvedValueOnce(project({ status: 'submitted' }));
    await expect(
      adminProjectsService.unpublish(project().id, { note: 'Not a live project' }, admin),
    ).rejects.toMatchObject({
      status: 409,
      code: 'invalid_transition',
    });
    expect(transition).not.toHaveBeenCalled();
  });

  it('passes the observed version and field diff into the atomic correction', async () => {
    const existing = project({
      title: 'Before',
      metadata: { mediaProcessingFailure: { imageId: 'image-1' } },
    });
    repo.findById.mockResolvedValue(existing);
    repo.correctMetadata.mockResolvedValue(null);

    await expect(
      adminProjectsService.correct(
        existing.id,
        { title: 'After', metadata: { reviewed: true } },
        admin,
      ),
    ).rejects.toMatchObject({ status: 409, code: 'invalid_transition' });
    expect(validateTaxonomy).toHaveBeenCalledWith(
      { title: 'After', metadata: { reviewed: true } },
      existing,
    );
    expect(repo.correctMetadata).toHaveBeenCalledWith({
      projectId: existing.id,
      actorUserId: admin.userId,
      patch: { title: 'After', metadata: { reviewed: true } },
      expectedRevision: existing.moderationRevision,
      fieldDiff: {
        title: { from: 'Before', to: 'After' },
        metadata: {
          from: { mediaProcessingFailure: { imageId: 'image-1' } },
          to: {
            mediaProcessingFailure: { imageId: 'image-1' },
            reviewed: true,
          },
        },
      },
    });
  });

  it('does not audit a metadata patch that only changes object key order', async () => {
    const existing = project({ metadata: { source: 'worker', reviewed: true } });
    repo.findById.mockResolvedValue(existing);
    const getById = vi.spyOn(adminProjectsService, 'getById').mockResolvedValue({} as never);

    await adminProjectsService.correct(
      existing.id,
      { metadata: { reviewed: true, source: 'worker' } },
      admin,
    );

    expect(repo.correctMetadata).not.toHaveBeenCalled();
    expect(getById).toHaveBeenCalledWith(existing.id);
    getById.mockRestore();
  });

  it('surfaces persisted duplicate provenance and tolerates an original signing failure', async () => {
    const matchedId = '55555555-5555-4555-8555-555555555555';
    repo.findById.mockResolvedValue(project());
    repo.listRooms.mockResolvedValue([]);
    repo.listImages.mockResolvedValue([
      image({
        duplicateOfImageId: matchedId,
        duplicateDistance: 3,
        status: 'failed',
      }),
    ]);
    repo.getReadyImageCounts.mockResolvedValue({ imageCount: 0, taggedImageCount: 0 });
    repo.listHistory.mockResolvedValue([]);
    signDownload.mockRejectedValue(new Error('R2 unavailable'));

    const result = await adminProjectsService.getById(project().id);

    expect(result.images[0]).toMatchObject({
      originalUrl: null,
      duplicate: { imageId: matchedId, distance: 3 },
    });
    expect(signDownload).not.toHaveBeenCalled();
  });
});
