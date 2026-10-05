import { createServer } from 'node:http';
import sharp from 'sharp';
import { Worker } from 'bullmq';
import { assertProductionSearchConfig, config, isProduction } from '@repo/config';
import { assertMediaStorageConfig } from '@repo/storage';
import { isGooglePlacesConfigured } from '@repo/google-places';
import {
  closeQueues,
  scheduleBookingNotificationSweep,
  scheduleGoogleReviewsSweep,
  scheduleVerificationNotificationSweep,
  scheduleBillingLifecycleSweep,
  scheduleDesignerExperienceRefresh,
} from '@repo/queue';
import { searchWriteClient } from '@repo/search';
import {
  connection,
  QUEUES,
  JOBS,
  type MediaProcessJob,
  type SmsQueueJob,
  type GoogleReviewsRefreshJob,
  type GoogleReviewsSweepJob,
  type SearchIndexJob,
  type VerificationEmailQueueJob,
  type BillingLifecycleSweepJob,
} from './connection.js';
import { processMedia } from './jobs/media-process.js';
import { markFailed } from './media/repository.js';
import { selectSmsSender } from './jobs/sms-sender.js';
import { SmsService } from './jobs/sms-service.js';
import { processBookingNotificationSweep } from './jobs/booking-notifications.js';
import { processGoogleReviewRefresh, processGoogleReviewSweep } from './jobs/google-reviews.js';
import { processSearchIndex } from './jobs/search-indexer.js';
import { dispatchSearchProjectionOutbox } from './search/outbox-dispatcher.js';
import { probeSearchReadiness } from './search/readiness.js';
import { purgeExpiredSearchActivity } from './search/activity-repository.js';
import { isDatabaseReady, closeDatabase } from './health/repository.js';
import { consumersAreReady, createWorkerReadinessProbe } from './health/readiness.js';
import {
  processVerificationEmail,
  processVerificationNotificationSweep,
} from './jobs/verification-notifications.js';
import { processBillingLifecycleSweep } from './jobs/billing-lifecycle.js';
import { closeEntitlementCache } from './billing-lifecycle/cache.js';
import {
  context,
  ROOT_CONTEXT,
  trace,
  SpanKind,
  SpanStatusCode,
  createBullMQTelemetry,
  shutdownTelemetry,
} from '@repo/telemetry/node';
import { logger } from './observability/logger.js';
import { observeProcessor, jobFields } from './observability/processor.js';
import {
  observeWorker,
  failureState,
  trackLifecycleTask,
  drainLifecycleTasks,
} from './observability/lifecycle.js';
import { startQueueMetrics } from './observability/queue-metrics.js';
import { finishWithin } from './observability/shutdown.js';

const tracer = trace.getTracer('tickif-worker');
function freshTask(name: string, task: () => Promise<void>): Promise<void> {
  return context.with(ROOT_CONTEXT, () =>
    tracer.startActiveSpan(name, { kind: SpanKind.INTERNAL }, async (span) => {
      try {
        await task();
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw err;
      } finally {
        span.end();
      }
    }),
  );
}

/**
 * Worker process. Each queue gets a Worker; handlers live under ./jobs.
 */
assertMediaStorageConfig();
if (isProduction) assertProductionSearchConfig();

// One libvips thread per job so BullMQ concurrency is the only parallelism knob, and no
// cross-job operation cache in a long-running process — both bound worker memory.
sharp.concurrency(1);
sharp.cache(false);
const telemetry = createBullMQTelemetry('tickif-worker');

const mediaWorker = new Worker<MediaProcessJob>(QUEUES.media, observeProcessor(processMedia), {
  connection,
  concurrency: config.MEDIA_WORKER_CONCURRENCY,
  telemetry,
});

// Provider strategy is selected once here, then injected into the service.
const smsService = new SmsService(
  selectSmsSender({
    provider: config.SMS_PROVIDER,
    novuSecretKey: config.NOVU_SECRET_KEY,
    novuWorkflowId: config.NOVU_OTP_WORKFLOW_ID,
    novuBookingWorkflowId: config.NOVU_BOOKING_WORKFLOW_ID,
    novuApiUrl: config.NOVU_API_URL,
    isProduction,
  }),
);

const smsWorker = new Worker<SmsQueueJob>(
  QUEUES.sms,
  observeProcessor(async (job) => {
    if (job.name === JOBS.sweepBookingNotifications) {
      const { enqueued, failed } = await processBookingNotificationSweep();
      // Report failures separately: an all-failing batch and an empty one both
      // enqueue zero, and only one of them is a problem.
      logger.info(
        { event: 'sweep.completed', sweep: 'booking-notifications', enqueued, failed },
        'Sweep completed',
      );
      return { enqueued, failed };
    }
    await smsService.send(job.data);
  }),
  {
    connection,
    concurrency: 4,
    telemetry,
  },
);
void scheduleBookingNotificationSweep(30_000).catch((err) =>
  logger.error(
    { event: 'scheduler.registration_failed', scheduler: 'booking-notifications', err },
    'Scheduler registration failed',
  ),
);

const verificationEmailWorker = new Worker<VerificationEmailQueueJob>(
  QUEUES.verificationEmail,
  observeProcessor(async (job) => {
    if (job.name === JOBS.sweepVerificationNotifications) {
      const { enqueued, failed, exhausted } = await processVerificationNotificationSweep();
      logger.info(
        {
          event: 'sweep.completed',
          sweep: 'verification-notifications',
          enqueued,
          failed,
          exhausted,
        },
        'Sweep completed',
      );
      return { enqueued, failed, exhausted };
    }
    if (job.data.kind === 'verification-email') {
      await processVerificationEmail(job.data.outboxId);
    }
  }),
  { connection, concurrency: 4, telemetry },
);
void scheduleVerificationNotificationSweep(30_000).catch((err) =>
  logger.error(
    { event: 'scheduler.registration_failed', scheduler: 'verification-notifications', err },
    'Scheduler registration failed',
  ),
);

const searchIndexWorker = new Worker<SearchIndexJob>(
  QUEUES.searchIndex,
  observeProcessor(processSearchIndex),
  {
    connection,
    concurrency: config.SEARCH_WORKER_CONCURRENCY,
    telemetry,
  },
);
void scheduleDesignerExperienceRefresh().catch((err) =>
  logger.error(
    { event: 'scheduler.registration_failed', scheduler: 'designer-experience', err },
    'Scheduler registration failed',
  ),
);

// E-239 plan-lapse lifecycle sweep: advances grace→locked→downgraded on
// config-driven windows and folds org-retention (invitation expiry) into the
// same tick. Concurrency 1 — transitions are state-guarded, no need to parallelize.
const billingLifecycleWorker = new Worker<BillingLifecycleSweepJob>(
  QUEUES.billingLifecycle,
  observeProcessor(async () => {
    const result = await processBillingLifecycleSweep();
    logger.info(
      { event: 'sweep.completed', sweep: 'billing-lifecycle', ...result },
      'Sweep completed',
    );
    return result;
  }),
  { connection, concurrency: 1, telemetry },
);
void scheduleBillingLifecycleSweep(config.BILLING_LIFECYCLE_SWEEP_INTERVAL_MS).catch((err) =>
  logger.error(
    { event: 'scheduler.registration_failed', scheduler: 'billing-lifecycle', err },
    'Scheduler registration failed',
  ),
);

// Google reviews worker + periodic sweep — only when a Places API key is set.
let googleReviewsWorker: Worker<GoogleReviewsRefreshJob | GoogleReviewsSweepJob> | undefined;
if (isGooglePlacesConfigured()) {
  googleReviewsWorker = new Worker<GoogleReviewsRefreshJob | GoogleReviewsSweepJob>(
    QUEUES.googleReviews,
    observeProcessor(async (job) => {
      if (job.name === JOBS.sweepGoogleReviews) {
        const result = await processGoogleReviewSweep();
        logger.info(
          { event: 'sweep.completed', sweep: 'google-reviews', ...result },
          'Sweep completed',
        );
        return result;
      }
      await processGoogleReviewRefresh((job.data as GoogleReviewsRefreshJob).profileId);
    }),
    { connection, concurrency: 4, telemetry },
  );
  // Register the repeatable hourly sweep (idempotent via stable scheduler id).
  void scheduleGoogleReviewsSweep(60 * 60 * 1000).catch((err) =>
    logger.error(
      { event: 'scheduler.registration_failed', scheduler: 'google-reviews', err },
      'Scheduler registration failed',
    ),
  );
  logger.info({ event: 'worker.google_reviews_enabled' }, 'Google reviews worker enabled');
}

mediaWorker.on('failed', (job) => {
  // Persist 'failed' only once retries are exhausted, so a transient error doesn't flap the status.
  if (job && failureState(job) === 'terminal') {
    trackLifecycleTask(
      markFailed(job.data.imageId, 'processing_failed').catch((err: unknown) =>
        logger.error(
          { ...jobFields(job), event: 'media.failure_persistence_failed', err },
          'Terminal media failure could not be persisted',
        ),
      ),
    );
  }
});

let draining = false;
let dependenciesReady = false;
let readinessPromise: Promise<void> | null = null;
let dispatchPromise: Promise<void> | null = null;
let searchActivityCleanupPromise: Promise<void> | null = null;
const consumers = [
  mediaWorker,
  smsWorker,
  searchIndexWorker,
  verificationEmailWorker,
  billingLifecycleWorker,
  ...(googleReviewsWorker ? [googleReviewsWorker] : []),
];
observeWorker(mediaWorker);
observeWorker(smsWorker);
observeWorker(searchIndexWorker);
observeWorker(verificationEmailWorker);
observeWorker(billingLifecycleWorker);
if (googleReviewsWorker) observeWorker(googleReviewsWorker);
const queueMetrics = startQueueMetrics();
const probeReadiness = createWorkerReadinessProbe({
  postgres: isDatabaseReady,
  search: () => probeSearchReadiness(() => searchWriteClient().health.retrieve()),
  consumers: () => consumersAreReady(consumers),
});

function refreshReadiness(): Promise<void> {
  if (readinessPromise) return readinessPromise;
  readinessPromise = probeReadiness()
    .then((ready) => {
      dependenciesReady = ready;
    })
    .finally(() => {
      readinessPromise = null;
    });
  return readinessPromise;
}

function dispatchSearchOutbox(): Promise<void> {
  if (dispatchPromise) return dispatchPromise;
  dispatchPromise = freshTask('search.outbox.dispatch', async () => {
    await dispatchSearchProjectionOutbox()
      .then(({ failed }) => {
        if (failed > 0) {
          trace.getActiveSpan()?.setStatus({ code: SpanStatusCode.ERROR });
          logger.error(
            { event: 'search.outbox_partial_failure', failed },
            'Search outbox enqueue attempts failed',
          );
        }
      })
      .catch((error) => {
        trace.getActiveSpan()?.setStatus({ code: SpanStatusCode.ERROR });
        logger.error({ event: 'search.outbox_failed', err: error }, 'Search outbox sweep failed');
      });
  }).finally(() => {
    dispatchPromise = null;
  });
  return dispatchPromise;
}

function cleanSearchActivity(): Promise<void> {
  if (searchActivityCleanupPromise) return searchActivityCleanupPromise;
  searchActivityCleanupPromise = freshTask('search.activity.cleanup', async () => {
    await purgeExpiredSearchActivity()
      .then((deleted) => {
        if (deleted > 0)
          logger.info(
            { event: 'search.activity_cleaned', deleted },
            'Expired search activity purged',
          );
      })
      .catch((error) => {
        trace.getActiveSpan()?.setStatus({ code: SpanStatusCode.ERROR });
        logger.error(
          { event: 'search.activity_cleanup_failed', err: error },
          'Search activity cleanup failed',
        );
      });
  }).finally(() => {
    searchActivityCleanupPromise = null;
  });
  return searchActivityCleanupPromise;
}

void refreshReadiness();
void dispatchSearchOutbox();
void cleanSearchActivity();
const readinessTimer = setInterval(() => void refreshReadiness(), 10_000);
const outboxTimer = setInterval(() => void dispatchSearchOutbox(), 2_000);
const searchActivityCleanupTimer = setInterval(
  () => void cleanSearchActivity(),
  24 * 60 * 60 * 1000,
);

// Liveness = process up; readiness flips to 503 on shutdown so an orchestrator stops routing first.
const health = createServer((req, res) => {
  if (req.url === '/livez') return void res.writeHead(200).end('ok');
  if (req.url === '/readyz') {
    const ready = !draining && dependenciesReady;
    return void res
      .writeHead(ready ? 200 : 503)
      .end(draining ? 'draining' : dependenciesReady ? 'ready' : 'dependencies-unavailable');
  }
  res.writeHead(404).end();
});
health.listen(config.WORKER_HEALTH_PORT);

logger.info(
  {
    event: 'worker.started',
    queues: consumers.map((worker) => worker.name),
    health_port: config.WORKER_HEALTH_PORT,
  },
  'Worker started',
);

async function shutdown(signal: string): Promise<void> {
  if (draining) return;
  draining = true;
  clearInterval(readinessTimer);
  clearInterval(outboxTimer);
  clearInterval(searchActivityCleanupTimer);
  logger.info({ event: 'worker.draining', signal }, 'Worker draining');
  let code = 0;
  try {
    const drained = await finishWithin(
      (async () => {
        const consumerResults = await Promise.allSettled([
          readinessPromise,
          dispatchPromise,
          searchActivityCleanupPromise,
          mediaWorker.close(),
          smsWorker.close(),
          searchIndexWorker.close(),
          verificationEmailWorker.close(),
          billingLifecycleWorker.close(),
          googleReviewsWorker?.close(),
          queueMetrics.stop(),
        ]);
        await drainLifecycleTasks();
        const dependencyResults = await Promise.allSettled([
          closeEntitlementCache(),
          closeQueues(),
          closeDatabase(),
        ]);
        const failures = [...consumerResults, ...dependencyResults].filter(
          (result): result is PromiseRejectedResult => result.status === 'rejected',
        );
        if (failures.length > 0)
          throw new AggregateError(
            failures.map((result) => result.reason),
            'Worker cleanup failed',
          );
      })(),
      110_000,
    );
    if (!drained) {
      logger.error({ event: 'worker.drain_timeout' }, 'Worker drain deadline exceeded');
      code = 1;
    }
  } catch (err) {
    logger.error({ event: 'worker.shutdown_failed', err }, 'Worker shutdown failed');
    code = 1;
  } finally {
    health.close();
    logger.info({ event: 'worker.stopped', exit_code: code }, 'Worker stopped');
    if (!(await shutdownTelemetry(3_000))) {
      logger.warn({ event: 'worker.telemetry_flush_timeout' }, 'Telemetry shutdown did not finish');
    }
    await finishWithin(logger.flush(), 2_000).catch(() => undefined);
    process.exit(code);
  }
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
