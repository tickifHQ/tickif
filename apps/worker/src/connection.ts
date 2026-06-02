import type { ConnectionOptions } from 'bullmq';
import { config } from '@repo/config';

/**
 * Shared BullMQ connection options. We pass an options object (not a constructed
 * ioredis instance) so BullMQ owns the client lifecycle and we avoid coupling to
 * a specific ioredis version's class type. `maxRetriesPerRequest: null` is
 * required by BullMQ for its blocking commands.
 */
export const connection: ConnectionOptions = {
  url: config.REDIS_URL,
  maxRetriesPerRequest: null,
};

/** Queue names — the contract between producers (api) and consumers (worker). */
export const QUEUES = {
  media: 'media',
} as const;

/** Payload for the proving media job (real Sharp pipeline lands in a later phase). */
export type MediaProcessJob = {
  imageId: string;
  storageKey: string;
};
