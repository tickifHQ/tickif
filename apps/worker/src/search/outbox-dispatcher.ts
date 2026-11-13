import {
  enqueueSearchDesignerDelete,
  enqueueSearchDesignerIndex,
  enqueueSearchProjectDelete,
  enqueueSearchProjectIndex,
} from '@repo/queue';
import {
  listDueSearchProjectionEvents,
  markSearchProjectionEventsEnqueued,
  type SearchProjectionOutboxRecord,
} from './outbox-repository.js';
import { logger } from '../observability/logger.js';

const DISPATCH_BATCH_SIZE = 100;
// An unfinished row is re-enqueued after 30s, doubling up to 10 minutes. The first delay
// outlasts the job's own BullMQ retries, and failed jobs are removed so the same id re-adds.
// Rows are never abandoned: an index delete must eventually land.
const RETRY_BACKOFF = { baseSeconds: 30, maxSeconds: 10 * 60 };

async function enqueueEvent(event: SearchProjectionOutboxRecord): Promise<void> {
  const updatedAtEpoch = event.sourceUpdatedAt.getTime();
  const eventId = event.sequence.toString();
  const outboxSequence = eventId;
  if (event.entityKind === 'project') {
    if (event.operation === 'delete') {
      await enqueueSearchProjectDelete({
        projectId: event.entityId,
        updatedAtEpoch,
        eventId,
        outboxSequence,
      });
    } else {
      await enqueueSearchProjectIndex({
        projectId: event.entityId,
        updatedAtEpoch,
        eventId,
        outboxSequence,
      });
    }
    return;
  }

  if (event.operation === 'delete') {
    await enqueueSearchDesignerDelete({
      profileId: event.entityId,
      updatedAtEpoch,
      eventId,
      outboxSequence,
    });
  } else {
    await enqueueSearchDesignerIndex({
      profileId: event.entityId,
      updatedAtEpoch,
      eventId,
      outboxSequence,
    });
  }
}

export async function dispatchSearchProjectionOutbox(): Promise<{
  enqueued: number;
  failed: number;
}> {
  const events = await listDueSearchProjectionEvents(DISPATCH_BATCH_SIZE);
  const enqueued: bigint[] = [];
  let failed = 0;

  for (const event of events) {
    try {
      await enqueueEvent(event);
      enqueued.push(event.sequence);
    } catch (error) {
      failed += 1;
      logger.error(
        {
          event: 'search.outbox_dispatch_failed',
          outbox_sequence: event.sequence.toString(),
          err: error,
        },
        'Search outbox dispatch failed',
      );
    }
  }

  await markSearchProjectionEventsEnqueued(enqueued, RETRY_BACKOFF);
  return { enqueued: enqueued.length, failed };
}
