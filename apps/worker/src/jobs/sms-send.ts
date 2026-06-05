import type { Job } from 'bullmq';
import { config, isProduction } from '@repo/config';
import type { SmsJob } from '../connection.js';
import { createSmsSender, type SmsSender } from './sms-sender.js';

const defaultSender = createSmsSender({
  authKey: config.MSG91_AUTH_KEY,
  senderId: config.MSG91_SENDER_ID,
  isProduction,
});

export async function processSmsWithSender(job: Job<SmsJob>, sender: SmsSender): Promise<{
  ok: true;
}> {
  await sender.send(job.data.phoneNumber, job.data.code);
  return { ok: true };
}

export async function processSms(job: Job<SmsJob>): Promise<{ ok: true }> {
  return processSmsWithSender(job, defaultSender);
}
