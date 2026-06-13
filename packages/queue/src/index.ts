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
} as const;

export const JOBS = {
  sendSms: 'send-sms',
  processMedia: 'process-media',
} as const;

export type MediaProcessJob = {
  imageId: string;
  storageKey: string;
};

export type SmsJob = {
  phoneNumber: string;
  code: string;
};

export const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1_000,
  },
  removeOnComplete: true,
  removeOnFail: 100,
} satisfies JobsOptions;

let smsQueue: Queue<SmsJob> | undefined;
let mediaQueue: Queue<MediaProcessJob> | undefined;

function getSmsQueue(): Queue<SmsJob> {
  smsQueue ??= new Queue<SmsJob>(QUEUES.sms, {
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

/** jobId keyed on imageId so at-least-once re-delivery of the same image collapses. */
function mediaJobId(imageId: string): string {
  return `media-${imageId}`;
}

export async function enqueueMedia(job: MediaProcessJob): Promise<void> {
  await getMediaQueue().add(JOBS.processMedia, job, { jobId: mediaJobId(job.imageId) });
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

export async function enqueueSms(job: SmsJob): Promise<void> {
  // Normalize the phone once, up front, so the stored job, the dedupe key, and the
  // provider all agree — identical requests with different formatting now collapse.
  const normalized: SmsJob = { phoneNumber: normalizePhone(job.phoneNumber), code: job.code };
  // defaultJobOptions is set on the Queue itself; only the per-job dedupe id here.
  await getSmsQueue().add(JOBS.sendSms, normalized, { jobId: smsJobId(normalized) });
}

export async function closeQueues(): Promise<void> {
  await Promise.all([smsQueue?.close(), mediaQueue?.close()]);
  smsQueue = undefined;
  mediaQueue = undefined;
}
