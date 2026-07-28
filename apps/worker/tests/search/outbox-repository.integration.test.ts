import { describe, expect, it } from 'vitest';
import {
  withSearchProjectionEntityLock,
  withSearchProjectionRebuildBarrier,
} from '../../src/search/outbox-repository.js';

describe('search projection entity lock', () => {
  it('serializes concurrent work for the same entity across database connections', async () => {
    let releaseFirst!: () => void;
    let signalFirstEntered!: () => void;
    const firstEntered = new Promise<void>((resolve) => {
      signalFirstEntered = resolve;
    });
    const firstRelease = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const order: string[] = [];

    const first = withSearchProjectionEntityLock('project', 'project-1', async () => {
      order.push('first-entered');
      signalFirstEntered();
      await firstRelease;
      order.push('first-leaving');
    });
    await firstEntered;

    const second = withSearchProjectionEntityLock('project', 'project-1', async () => {
      order.push('second-entered');
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(order).toEqual(['first-entered']);

    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(['first-entered', 'first-leaving', 'second-entered']);
  });

  it('waits for active index writes before entering the rebuild barrier', async () => {
    let releaseIndexer!: () => void;
    let signalIndexerEntered!: () => void;
    const indexerEntered = new Promise<void>((resolve) => {
      signalIndexerEntered = resolve;
    });
    const indexerRelease = new Promise<void>((resolve) => {
      releaseIndexer = resolve;
    });
    const order: string[] = [];

    const indexer = withSearchProjectionEntityLock('designer', 'designer-1', async () => {
      order.push('indexer-entered');
      signalIndexerEntered();
      await indexerRelease;
      order.push('indexer-leaving');
    });
    await indexerEntered;

    const rebuild = withSearchProjectionRebuildBarrier(async () => {
      order.push('rebuild-entered');
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(order).toEqual(['indexer-entered']);

    releaseIndexer();
    await Promise.all([indexer, rebuild]);
    expect(order).toEqual(['indexer-entered', 'indexer-leaving', 'rebuild-entered']);
  });
});
