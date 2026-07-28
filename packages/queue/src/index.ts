import { createHash } from 'node:crypto';
import { Queue, type ConnectionOptions, type JobsOptions } from 'bullmq';
import { config } from '@repo/config';

/**
 * Shared BullMQ connection options. Pass options, not a constructed ioredis
 * instance, so BullMQ owns client lifecycle and avoids cross-version type leaks.
 */
export const connection: ConnectionOptions = {
  url: config.REDIS_URL,
  maxRetriesPerRequest: null,
};

export const QUEUES = {
  media: 'media',
  sms: 'sms',
  googleReviews: 'google-reviews',
  searchIndex: 'search-index',
} as const;

export const JOBS = {
  sendSms: 'send-sms',
  sendBookingRequestedSms: 'send-booking-requested-sms',
  sweepBookingNotifications: 'sweep-booking-notifications',
  processMedia: 'process-media',
  refreshGoogleReviews: 'refresh-google-reviews',
  sweepGoogleReviews: 'sweep-google-reviews',
  indexProject: 'index-project',
  deleteProject: 'delete-project',
  indexDesigner: 'index-designer',
  deleteDesigner: 'delete-designer',
  reindexAll: 'reindex-all',
} as const;

export type MediaProcessJob = {
  imageId: string;
  mode?: 'reprocess';
};

export type SmsJob = {
  phoneNumber: string;
  code: string;
};

export type OtpSmsQueueJob = SmsJob & {
  kind: 'otp';
};

export type BookingRequestedSmsJob = {
  kind: 'booking-requested';
  phoneNumber: string;
  bookingId: string;
  requesterName: string;
};

export type BookingNotification = Omit<BookingRequestedSmsJob, 'kind'>;

export type BookingNotificationSweepJob = {
  kind: 'booking-notification-sweep';
};

/** Includes the legacy OTP shape so jobs queued before this release still drain safely. */
export type SmsQueueJob =
  | SmsJob
  | OtpSmsQueueJob
  | BookingRequestedSmsJob
  | BookingNotificationSweepJob;

/** Refresh one designer's cached Google reviews. */
export type GoogleReviewsRefreshJob = {
  profileId: string;
};

/** Periodic sweep: refetch stale rows + purge ToS-expired review payloads. */
export type GoogleReviewsSweepJob = Record<string, never>;

export type SearchIndexProjectJob = {
  projectId: string;
  updatedAtEpoch: number;
  eventId: string;
  outboxSequence?: string;
};

export type SearchDeleteProjectJob = {
  projectId: string;
  updatedAtEpoch: number;
  eventId: string;
  outboxSequence?: string;
};

export type SearchIndexDesignerJob = {
  profileId: string;
  updatedAtEpoch: number;
  eventId: string;
  outboxSequence?: string;
};

export type SearchDeleteDesignerJob = {
  profileId: string;
  updatedAtEpoch: number;
  eventId: string;
  outboxSequence?: string;
};

export type SearchReindexAllJob = {
  requestedAtEpoch: number;
};

export type SearchIndexJob =
  | SearchIndexProjectJob
  | SearchDeleteProjectJob
  | SearchIndexDesignerJob
  | SearchDeleteDesignerJob
  | SearchReindexAllJob;

/** Stable scheduler id so re-registering the repeatable sweep is idempotent. */
export const GOOGLE_REVIEWS_SWEEP_SCHEDULER = 'google-reviews-sweep';
export const BOOKING_NOTIFICATIONS_SWEEP_SCHEDULER = 'booking-notifications-sweep';

export const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1_000,
  },
  removeOnComplete: true,
  // Keep failed jobs for a week (not a fixed count) so a failure spike can't silently evict evidence.
  removeOnFail: { age: 7 * 24 * 3600, count: 5000 },
} satisfies JobsOptions;

let smsQueue: Queue<SmsQueueJob> | undefined;
let mediaQueue: Queue<MediaProcessJob> | undefined;
let googleReviewsQueue: Queue<GoogleReviewsRefreshJob | GoogleReviewsSweepJob> | undefined;
let searchIndexQueue: Queue<SearchIndexJob> | undefined;

function getSmsQueue(): Queue<SmsQueueJob> {
  smsQueue ??= new Queue<SmsQueueJob>(QUEUES.sms, {
    connection,
    defaultJobOptions,
  });
  return smsQueue;
}

function getMediaQueue(): Queue<MediaProcessJob> {
  mediaQueue ??= new Queue<MediaProcessJob>(QUEUES.media, {
    connection,
    defaultJobOptions,
  });
  return mediaQueue;
}

/** Job IDs are stable per image and operation so duplicate delivery collapses. */
function mediaJobId(job: MediaProcessJob): string {
  return job.mode === 'reprocess' ? `media-reprocess-${job.imageId}` : `media-${job.imageId}`;
}

export async function enqueueMedia(job: MediaProcessJob): Promise<void> {
  await getMediaQueue().add(JOBS.processMedia, job, { jobId: mediaJobId(job) });
}

/** Normalize a phone number to bare digits — for stable dedupe keys and provider APIs. */
export function normalizePhone(phoneNumber: string): string {
  return phoneNumber.replace(/\D/g, '');
}

/** Build a dedupe jobId from an already-normalized job so identical double-fires collapse. */
function smsJobId(job: SmsJob): string {
  const phone = job.phoneNumber || 'unknown';
  const digest = createHash('sha256')
    .update(`${job.phoneNumber}:${job.code}`)
    .digest('hex')
    .slice(0, 16);
  return `otp-${phone}-${digest}`;
}

function bookingNotificationJobId(job: BookingRequestedSmsJob): string {
  const digest = createHash('sha256')
    .update(`${job.bookingId}:${job.phoneNumber}`)
    .digest('hex')
    .slice(0, 16);
  return `booking-requested-${digest}`;
}

function getGoogleReviewsQueue(): Queue<GoogleReviewsRefreshJob | GoogleReviewsSweepJob> {
  googleReviewsQueue ??= new Queue<GoogleReviewsRefreshJob | GoogleReviewsSweepJob>(
    QUEUES.googleReviews,
    { connection, defaultJobOptions },
  );
  return googleReviewsQueue;
}

function getSearchIndexQueue(): Queue<SearchIndexJob> {
  searchIndexQueue ??= new Queue<SearchIndexJob>(QUEUES.searchIndex, {
    connection,
    defaultJobOptions,
  });
  return searchIndexQueue;
}

/**
 * Enqueue a refresh for one profile. JobId is per-profile so a burst of
 * connect/refresh clicks collapses to a single in-flight job.
 */
export async function enqueueGoogleReviewsRefresh(job: GoogleReviewsRefreshJob): Promise<void> {
  await getGoogleReviewsQueue().add(JOBS.refreshGoogleReviews, job, {
    jobId: `google-refresh-${job.profileId}`,
  });
}

/**
 * Register (or update) the repeatable sweep. Idempotent via a stable scheduler
 * id, so calling this on every worker boot never stacks duplicate schedules.
 */
export async function scheduleGoogleReviewsSweep(everyMs: number): Promise<void> {
  await getGoogleReviewsQueue().upsertJobScheduler(
    GOOGLE_REVIEWS_SWEEP_SCHEDULER,
    { every: everyMs },
    { name: JOBS.sweepGoogleReviews, data: {} },
  );
}

export async function enqueueSms(job: SmsJob): Promise<void> {
  // Normalize the phone once, up front, so the stored job, the dedupe key, and the
  // provider all agree — identical requests with different formatting now collapse.
  const normalized: OtpSmsQueueJob = {
    kind: 'otp',
    phoneNumber: normalizePhone(job.phoneNumber),
    code: job.code,
  };
  // defaultJobOptions is set on the Queue itself; only the per-job dedupe id here.
  await getSmsQueue().add(JOBS.sendSms, normalized, { jobId: smsJobId(normalized) });
}

export async function enqueueBookingNotification(job: BookingNotification): Promise<void> {
  const normalized: BookingRequestedSmsJob = {
    kind: 'booking-requested',
    phoneNumber: normalizePhone(job.phoneNumber),
    bookingId: job.bookingId,
    requesterName: job.requesterName,
  };
  await getSmsQueue().add(JOBS.sendBookingRequestedSms, normalized, {
    jobId: bookingNotificationJobId(normalized),
    removeOnComplete: { age: 24 * 3600, count: 5000 },
  });
}

export async function scheduleBookingNotificationSweep(everyMs: number): Promise<void> {
  await getSmsQueue().upsertJobScheduler(
    BOOKING_NOTIFICATIONS_SWEEP_SCHEDULER,
    { every: everyMs },
    {
      name: JOBS.sweepBookingNotifications,
      data: { kind: 'booking-notification-sweep' },
    },
  );
}

export async function enqueueSearchProjectIndex(job: SearchIndexProjectJob): Promise<void> {
  await getSearchIndexQueue().add(JOBS.indexProject, job, {
    jobId: `${JOBS.indexProject}-${job.projectId}-${job.eventId}`,
  });
}

export async function enqueueSearchProjectDelete(job: SearchDeleteProjectJob): Promise<void> {
  await getSearchIndexQueue().add(JOBS.deleteProject, job, {
    jobId: `${JOBS.deleteProject}-${job.projectId}-${job.eventId}`,
  });
}

export async function enqueueSearchDesignerIndex(job: SearchIndexDesignerJob): Promise<void> {
  await getSearchIndexQueue().add(JOBS.indexDesigner, job, {
    jobId: `${JOBS.indexDesigner}-${job.profileId}-${job.eventId}`,
  });
}

export async function enqueueSearchDesignerDelete(job: SearchDeleteDesignerJob): Promise<void> {
  await getSearchIndexQueue().add(JOBS.deleteDesigner, job, {
    jobId: `${JOBS.deleteDesigner}-${job.profileId}-${job.eventId}`,
  });
}

export async function enqueueSearchReindexAll(job: SearchReindexAllJob): Promise<void> {
  await getSearchIndexQueue().add(JOBS.reindexAll, job, {
    jobId: `${JOBS.reindexAll}-${job.requestedAtEpoch}`,
    deduplication: { id: JOBS.reindexAll },
  });
}

export async function closeQueues(): Promise<void> {
  await Promise.all([
    smsQueue?.close(),
    mediaQueue?.close(),
    googleReviewsQueue?.close(),
    searchIndexQueue?.close(),
  ]);
  smsQueue = undefined;
  mediaQueue = undefined;
  googleReviewsQueue = undefined;
  searchIndexQueue = undefined;
}
