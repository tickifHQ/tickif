import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QueueOptions } from 'bullmq';

const fake = vi.hoisted(() => ({
  add: vi.fn(),
  schedule: vi.fn(),
  close: vi.fn(),
  construct: vi.fn(),
}));
vi.mock('bullmq', () => ({
  Queue: vi.fn(function Queue(name: string, options: QueueOptions) {
    fake.construct(name, options);
    return { add: fake.add, upsertJobScheduler: fake.schedule, close: fake.close };
  }),
}));

describe('queue telemetry compatibility', () => {
  afterEach(async () => {
    const { closeQueues } = await import('../src/index.js');
    await closeQueues();
    vi.clearAllMocks();
  });

  it('attaches the native carrier without changing business payload or dedupe identity', async () => {
    const { enqueueMedia } = await import('../src/index.js');
    await enqueueMedia({ imageId: 'image-1' });
    expect(fake.construct).toHaveBeenCalledWith(
      'media',
      expect.objectContaining({
        telemetry: expect.objectContaining({ contextManager: expect.any(Object) }),
      }),
    );
    expect(fake.add).toHaveBeenCalledWith(
      'process-media',
      { imageId: 'image-1' },
      { jobId: 'media-image-1' },
    );
  });

  it('does not perpetuate the scheduler registration trace into recurring jobs', async () => {
    const {
      scheduleGoogleReviewsSweep,
      scheduleBookingNotificationSweep,
      scheduleVerificationNotificationSweep,
      scheduleBillingLifecycleSweep,
    } = await import('../src/index.js');
    await scheduleGoogleReviewsSweep(60_000);
    await scheduleBookingNotificationSweep(30_000);
    await scheduleVerificationNotificationSweep(30_000);
    await scheduleBillingLifecycleSweep(60_000);
    expect(fake.schedule).toHaveBeenCalledTimes(4);
    for (const [, , template] of fake.schedule.mock.calls) {
      expect(template).toMatchObject({ opts: { telemetry: { omitContext: true } } });
      expect(template.data).not.toHaveProperty('traceparent');
    }
  });
});
