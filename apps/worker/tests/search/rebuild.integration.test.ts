import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  SEARCH_COLLECTION_KINDS,
  bootstrapSearch,
  getSearchCollectionTarget,
  searchCollectionName,
  searchWriteClient,
  type SearchCollectionKind,
} from '@repo/search';
import { closeQueues } from '@repo/queue';
import { rebuildSearchCollections } from '../../src/search/rebuild.js';

async function versionedCollections(kind: SearchCollectionKind): Promise<string[]> {
  const prefix = `${searchCollectionName(kind)}_v`;
  return (await searchWriteClient().collections().retrieve())
    .map((collection) => collection.name)
    .filter((name) => name.startsWith(prefix))
    .sort();
}

beforeAll(async () => {
  await bootstrapSearch({ applyUpdates: true });
});

afterAll(async () => {
  await closeQueues();
});

describe('full search rebuild against Typesense', () => {
  it('keeps only the live and previous collections after repeated rebuilds', async () => {
    const requestedAtEpoch = Date.now();
    await rebuildSearchCollections(requestedAtEpoch, 0);
    const superseded = await Promise.all(
      SEARCH_COLLECTION_KINDS.map((kind) => getSearchCollectionTarget(kind)),
    );
    await rebuildSearchCollections(requestedAtEpoch + 1, 0);
    const rebuilt = await rebuildSearchCollections(requestedAtEpoch + 2, 0);

    for (const [index, kind] of SEARCH_COLLECTION_KINDS.entries()) {
      const live = await getSearchCollectionTarget(kind);
      expect(live).toBe(rebuilt.collections[kind]);
      const remaining = await versionedCollections(kind);
      expect(remaining).toHaveLength(2);
      expect(remaining).toContain(live);
      expect(remaining).not.toContain(superseded[index]);
    }
  });
});
