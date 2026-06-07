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

function getSmsQueue(): Queue<SmsJob> {
  smsQueue ??= new Queue<SmsJob>(QUEUES.sms, {
    connection,
    defaultJobOptions,
  });
  return smsQueue;
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
  await getSmsQueue().add(JOBS.sendSms, normalized, {
    ...defaultJobOptions,
    jobId: smsJobId(normalized),
  });
}

export async function closeQueues(): Promise<void> {
  await smsQueue?.close();
  smsQueue = undefined;
}
