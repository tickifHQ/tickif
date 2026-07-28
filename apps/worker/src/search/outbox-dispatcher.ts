import {
  enqueueSearchDesignerDelete,
  enqueueSearchDesignerIndex,
  enqueueSearchProjectDelete,
  enqueueSearchProjectIndex,
} from '@repo/queue';
import {
  listPendingSearchProjectionEvents,
  type SearchProjectionOutboxRecord,
} from './outbox-repository.js';

const DISPATCH_BATCH_SIZE = 100;

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
  const events = await listPendingSearchProjectionEvents(DISPATCH_BATCH_SIZE);
  let enqueued = 0;
  let failed = 0;

  for (const event of events) {
    try {
      await enqueueEvent(event);
      enqueued += 1;
    } catch (error) {
      failed += 1;
      console.error(`[worker] search outbox ${event.sequence} dispatch failed:`, error);
    }
  }

  return { enqueued, failed };
}
