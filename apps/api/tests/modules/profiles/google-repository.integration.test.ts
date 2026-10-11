import { describe, it, expect } from 'vitest';
import { makeDesigner } from '@repo/db/testing';
import { googleReviewsRepository } from '../../../src/modules/profiles/google-repository.js';

/**
 * Covers the DB round-trip behind the connect/refresh cooldown (the service
 * logic itself is unit-tested in google-service.test.ts).
 */
describe('googleReviewsRepository.touchAttempt (integration)', () => {
  it('no-ops when the profile has no cache row yet', async () => {
    const designer = await makeDesigner();
    await googleReviewsRepository.touchAttempt(designer.id);
    expect(await googleReviewsRepository.findByProfileId(designer.id)).toBeNull();
  });

  it('stamps lastAttemptAt on an existing row', async () => {
    const designer = await makeDesigner();
    await googleReviewsRepository.upsert(designer.id, { placeId: 'ChIJseed', status: 'pending' });

    const before = await googleReviewsRepository.findByProfileId(designer.id);
    expect(before?.lastAttemptAt).toBeNull();

    await googleReviewsRepository.touchAttempt(designer.id);
    const after = await googleReviewsRepository.findByProfileId(designer.id);
    expect(after?.lastAttemptAt).toBeInstanceOf(Date);
  });

  it('persists lastAttemptAt written through a connect upsert', async () => {
    const designer = await makeDesigner();
    const stamp = new Date();
    await googleReviewsRepository.upsert(designer.id, {
      placeId: 'ChIJseed',
      status: 'pending',
      lastAttemptAt: stamp,
    });
    const row = await googleReviewsRepository.findByProfileId(designer.id);
    expect(row?.lastAttemptAt?.getTime()).toBe(stamp.getTime());
  });
});

describe('googleReviewsRepository.restoreRefresh', () => {
  it('restores only the failed pending attempt', async () => {
    const designer = await makeDesigner();
    const attemptAt = new Date();
    await googleReviewsRepository.upsert(designer.id, {
      placeId: 'ChIJseed',
      status: 'pending',
      lastAttemptAt: attemptAt,
    });
    await googleReviewsRepository.restoreRefresh(designer.id, attemptAt, {
      status: 'error',
      lastError: 'Previous provider error',
    });
    expect(await googleReviewsRepository.findByProfileId(designer.id)).toMatchObject({
      status: 'error',
      lastError: 'Previous provider error',
    });
  });

  it('does not overwrite a completed worker fetch', async () => {
    const designer = await makeDesigner();
    const attemptAt = new Date();
    await googleReviewsRepository.upsert(designer.id, {
      placeId: 'ChIJseed',
      status: 'connected',
      lastAttemptAt: attemptAt,
      rating: '4.9',
    });
    await googleReviewsRepository.restoreRefresh(designer.id, attemptAt, {
      status: 'error',
      lastError: 'Previous provider error',
    });
    expect(await googleReviewsRepository.findByProfileId(designer.id)).toMatchObject({
      status: 'connected',
      rating: '4.9',
      lastError: null,
    });
  });

  it('does not overwrite a newer pending attempt or recreate a disconnected row', async () => {
    const designer = await makeDesigner();
    const attemptAt = new Date('2026-10-11T00:00:00Z');
    const newerAttempt = new Date('2026-10-11T00:01:00Z');
    await googleReviewsRepository.upsert(designer.id, {
      placeId: 'ChIJnew',
      status: 'pending',
      lastAttemptAt: newerAttempt,
    });
    await googleReviewsRepository.restoreRefresh(designer.id, attemptAt, {
      status: 'error',
      lastError: 'Previous provider error',
    });
    expect(await googleReviewsRepository.findByProfileId(designer.id)).toMatchObject({
      status: 'pending',
      placeId: 'ChIJnew',
      lastAttemptAt: newerAttempt,
    });
    await googleReviewsRepository.delete(designer.id);
    await googleReviewsRepository.restoreRefresh(designer.id, newerAttempt, {
      status: 'error',
      lastError: 'Previous provider error',
    });
    expect(await googleReviewsRepository.findByProfileId(designer.id)).toBeNull();
  });
});
