import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../src/lib/errors.js';

vi.mock('../../../src/modules/reports/repository.js', () => ({
  reportsRepository: {
    findProfileContext: vi.fn(),
    countProjectsByStatus: vi.fn(),
    countLeadsByStatus: vi.fn(),
    countProjectsCreatedByDay: vi.fn(),
    countLeadsReceivedByDay: vi.fn(),
    countViewsByDay: vi.fn(),
    findTopConvertingProjects: vi.fn(),
    countAcquisitionSources: vi.fn(),
  },
}));

const { reportsService } = await import('../../../src/modules/reports/service.js');
const { reportsRepository } = await import('../../../src/modules/reports/repository.js');

const input = {
  userId: 'user_1',
  orgId: 'org_1',
  query: { days: 7 },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-07T12:30:00.000Z'));
  vi.mocked(reportsRepository.findProfileContext).mockResolvedValue({
    profileId: '11111111-1111-4111-8111-111111111111',
    orgId: 'org_1',
  });
  vi.mocked(reportsRepository.countProjectsByStatus).mockResolvedValue([]);
  vi.mocked(reportsRepository.countLeadsByStatus).mockResolvedValue([]);
  vi.mocked(reportsRepository.countProjectsCreatedByDay).mockResolvedValue([]);
  vi.mocked(reportsRepository.countLeadsReceivedByDay).mockResolvedValue([]);
  vi.mocked(reportsRepository.countViewsByDay).mockResolvedValue([]);
  vi.mocked(reportsRepository.findTopConvertingProjects).mockResolvedValue([]);
  vi.mocked(reportsRepository.countAcquisitionSources).mockResolvedValue([]);
});

afterAll(() => {
  vi.useRealTimers();
});

describe('reportsService.getAnalytics', () => {
  it('returns fixed status buckets and fills missing activity days', async () => {
    vi.mocked(reportsRepository.countProjectsByStatus).mockResolvedValue([
      { status: 'draft', count: 2 },
      { status: 'published', count: 3 },
      { status: 'changes_requested', count: 1 },
    ]);
    vi.mocked(reportsRepository.countLeadsByStatus)
      .mockResolvedValueOnce([
        { status: 'new', count: 4 },
        { status: 'contacted', count: 2 },
        { status: 'closed', count: 1 },
      ])
      .mockResolvedValueOnce([
        { status: 'new', count: 2 },
        { status: 'contacted', count: 1 },
      ]);
    vi.mocked(reportsRepository.countProjectsCreatedByDay).mockResolvedValue([
      { date: '2026-08-02', count: 1 },
      { date: '2026-08-07', count: 2 },
    ]);
    vi.mocked(reportsRepository.countLeadsReceivedByDay).mockResolvedValue([
      { date: '2026-08-04', count: 3 },
    ]);
    vi.mocked(reportsRepository.countViewsByDay)
      .mockResolvedValueOnce([
        { type: 'project_view', date: '2026-08-04', count: 5 },
        { type: 'profile_view', date: '2026-08-07', count: 2 },
      ])
      .mockResolvedValueOnce([
        { type: 'project_view', date: '2026-07-28', count: 4 },
        { type: 'profile_view', date: '2026-07-29', count: 1 },
      ]);
    vi.mocked(reportsRepository.findTopConvertingProjects).mockResolvedValue([
      {
        projectId: '22222222-2222-4222-8222-222222222222',
        title: 'Warm apartment',
        citySlug: 'chennai',
        localitySlug: 'velachery',
        views: 5,
        enquiries: 2,
        conversions: 1,
      },
    ]);
    vi.mocked(reportsRepository.countAcquisitionSources).mockResolvedValue([
      { source: 'project-enquiry', enquiries: 2, conversions: 1 },
    ]);

    const result = await reportsService.getAnalytics(input);

    expect(result.window).toEqual({
      days: 7,
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-07T12:30:00.000Z',
    });
    expect(result.projects).toEqual({
      total: 6,
      draft: 2,
      submitted: 0,
      inReview: 0,
      published: 3,
      rejected: 0,
      changesRequested: 1,
    });
    expect(result.leads).toEqual({
      total: 7,
      new: 4,
      contacted: 2,
      closed: 1,
      spam: 0,
    });
    expect(result.engagement).toEqual({ projectViews: 5, profileViews: 2 });
    expect(result.previousPeriod).toEqual({
      projectViews: 4,
      enquiries: 3,
      viewToEnquiryRate: 75,
      responseRate: (1 / 3) * 100,
    });
    expect(result.activity).toHaveLength(7);
    expect(result.activity[0]).toEqual({
      date: '2026-08-01',
      projectsCreated: 0,
      leadsReceived: 0,
      projectViews: 0,
      profileViews: 0,
    });
    expect(result.activity[3]).toEqual({
      date: '2026-08-04',
      projectsCreated: 0,
      leadsReceived: 3,
      projectViews: 5,
      profileViews: 0,
    });
    expect(result.activity[6]).toEqual({
      date: '2026-08-07',
      projectsCreated: 2,
      leadsReceived: 0,
      projectViews: 0,
      profileViews: 2,
    });
    expect(result.topConvertingProjects).toEqual([
      expect.objectContaining({ title: 'Warm apartment', conversions: 1 }),
    ]);
    expect(result.acquisitionSources).toEqual([
      { source: 'project-enquiry', enquiries: 2, conversions: 1 },
    ]);
    expect(result.deferredMetrics).toEqual([]);
  });

  it('scopes every aggregate to the resolved active organization profile', async () => {
    await reportsService.getAnalytics(input);

    expect(reportsRepository.findProfileContext).toHaveBeenCalledWith({
      userId: 'user_1',
      orgId: 'org_1',
    });
    expect(reportsRepository.countProjectsByStatus).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
    );
    expect(reportsRepository.countLeadsByStatus).toHaveBeenNthCalledWith(1, {
      orgId: 'org_1',
      from: new Date('2026-08-01T00:00:00.000Z'),
      to: new Date('2026-08-07T12:30:00.000Z'),
    });
    expect(reportsRepository.countProjectsCreatedByDay).toHaveBeenCalledWith({
      profileId: '11111111-1111-4111-8111-111111111111',
      from: new Date('2026-08-01T00:00:00.000Z'),
      to: new Date('2026-08-07T12:30:00.000Z'),
    });
    expect(reportsRepository.countLeadsReceivedByDay).toHaveBeenCalledWith({
      orgId: 'org_1',
      from: new Date('2026-08-01T00:00:00.000Z'),
      to: new Date('2026-08-07T12:30:00.000Z'),
    });
    expect(reportsRepository.countViewsByDay).toHaveBeenNthCalledWith(1, {
      profileId: '11111111-1111-4111-8111-111111111111',
      from: new Date('2026-08-01T00:00:00.000Z'),
      to: new Date('2026-08-07T12:30:00.000Z'),
    });
    expect(reportsRepository.countLeadsByStatus).toHaveBeenNthCalledWith(2, {
      orgId: 'org_1',
      from: new Date('2026-07-25T00:00:00.000Z'),
      to: new Date('2026-07-31T23:59:59.999Z'),
    });
    expect(reportsRepository.countViewsByDay).toHaveBeenNthCalledWith(2, {
      profileId: '11111111-1111-4111-8111-111111111111',
      from: new Date('2026-07-25T00:00:00.000Z'),
      to: new Date('2026-07-31T23:59:59.999Z'),
    });
    expect(reportsRepository.findTopConvertingProjects).toHaveBeenCalledWith({
      profileId: '11111111-1111-4111-8111-111111111111',
      orgId: 'org_1',
      from: new Date('2026-08-01T00:00:00.000Z'),
      to: new Date('2026-08-07T12:30:00.000Z'),
    });
    expect(reportsRepository.countAcquisitionSources).toHaveBeenCalledWith({
      orgId: 'org_1',
      from: new Date('2026-08-01T00:00:00.000Z'),
      to: new Date('2026-08-07T12:30:00.000Z'),
    });
  });

  it('rejects requests without an active organization before querying', async () => {
    await expect(reportsService.getAnalytics({ ...input, orgId: null })).rejects.toMatchObject({
      status: 422,
    });
    expect(reportsRepository.findProfileContext).not.toHaveBeenCalled();
  });

  it('requires a designer profile in the active organization', async () => {
    vi.mocked(reportsRepository.findProfileContext).mockResolvedValue(null);

    await expect(reportsService.getAnalytics(input)).rejects.toBeInstanceOf(AppError);
    await expect(reportsService.getAnalytics(input)).rejects.toMatchObject({ status: 403 });
  });
});
