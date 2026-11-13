import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Queue, UnrecoverableError, Worker, type Job } from 'bullmq';
import {
  DESIGNER_EXPERIENCE_SWEEP_SCHEDULER,
  QUEUES,
  closeQueues,
  connection,
  enqueueGoogleReviewsRefresh,
  enqueueMedia,
  scheduleDesignerExperienceRefresh,
} from '@repo/queue';
import { failureState } from '../../src/observability/lifecycle.js';

type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

const queues = new Map<QueueName, Queue>();

function queue(name: QueueName): Queue {
  const existing = queues.get(name);
  if (existing) return existing;
  const created = new Queue(name, { connection });
  queues.set(name, created);
  return created;
}

/** Run one job on a consumer and resolve with the job as BullMQ reported its outcome. */
async function runOnce(name: QueueName, fail: boolean): Promise<Job> {
  let worker: Worker | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<Job>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`no ${name} job ran`)), 5_000);
      worker = new Worker(
        name,
        async () => {
          if (fail) throw new UnrecoverableError('provider unavailable');
        },
        { connection },
      );
      worker.on('failed', (job) => (job ? resolve(job) : reject(new Error('missing job'))));
      worker.on('completed', resolve);
    });
  } finally {
    clearTimeout(timer);
    await worker?.close();
  }
}

beforeEach(async () => {
  await Promise.all(
    [QUEUES.googleReviews, QUEUES.media, QUEUES.searchIndex].map((name) =>
      queue(name).obliterate({ force: true }),
    ),
  );
});

afterAll(async () => {
  await Promise.all([...queues.values()].map((item) => item.obliterate({ force: true })));
  await Promise.all([...queues.values()].map((item) => item.close()));
  await closeQueues();
});

describe('fixed-id jobs after a terminal failure', () => {
  it('runs a Google review refresh requested after the previous refresh failed', async () => {
    const profileId = crypto.randomUUID();
    await enqueueGoogleReviewsRefresh({ profileId });
    await runOnce(QUEUES.googleReviews, true);

    await enqueueGoogleReviewsRefresh({ profileId });

    const retried = await runOnce(QUEUES.googleReviews, false);
    expect(retried.id).toBe(`google-refresh-${profileId}`);
  });

  it('reruns media processing and still reports the failure as terminal', async () => {
    const imageId = crypto.randomUUID();
    await enqueueMedia({ imageId });
    const failed = await runOnce(QUEUES.media, true);
    expect(failureState(failed)).toBe('terminal');

    await enqueueMedia({ imageId });

    const retried = await runOnce(QUEUES.media, false);
    expect(retried.id).toBe(`media-${imageId}`);
  });

  it('runs the designer experience catch-up again on the next worker start', async () => {
    await scheduleDesignerExperienceRefresh();
    await runOnce(QUEUES.searchIndex, true);
    await queue(QUEUES.searchIndex).removeJobScheduler(DESIGNER_EXPERIENCE_SWEEP_SCHEDULER);

    await scheduleDesignerExperienceRefresh();
    await queue(QUEUES.searchIndex).removeJobScheduler(DESIGNER_EXPERIENCE_SWEEP_SCHEDULER);

    const retried = await runOnce(QUEUES.searchIndex, false);
    expect(retried.id).toBe('designer-experience-startup');
  });
});
