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

function smsJobId(job: SmsJob): string {
  const phone = job.phoneNumber.replace(/\D/g, '') || 'unknown';
  const digest = createHash('sha256')
    .update(`${job.phoneNumber}:${job.code}`)
    .digest('hex')
    .slice(0, 16);
  return `otp-${phone}-${digest}`;
}

export async function enqueueSms(job: SmsJob): Promise<void> {
  await getSmsQueue().add(JOBS.sendSms, job, {
    ...defaultJobOptions,
    jobId: smsJobId(job),
  });
}

export async function closeQueues(): Promise<void> {
  await smsQueue?.close();
  smsQueue = undefined;
}
