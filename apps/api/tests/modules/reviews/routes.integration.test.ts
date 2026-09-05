import { describe, expect, it } from 'vitest';
import type { ReviewResponse } from '@repo/contracts';
import { makeDesigner } from '@repo/db/testing';
import { app } from '../../../src/app.js';
import { createRoleSession } from '../../helpers/auth.js';

describe('review routes', () => {
  it('submits an eligible review and exposes only published reviews publicly', async () => {
    const designer = await makeDesigner({ status: 'active' });
    const visitor = await createRoleSession('+919800004101', 'visitor');
    const admin = await createRoleSession('+919800004102', 'admin');

    const submittedResponse = await app.request('/api/reviews', {
      method: 'POST',
      headers: {
        cookie: visitor.cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        designerProfileId: designer.id,
        rating: 5,
        body: 'A clear process, thoughtful choices, and a result that works beautifully.',
      }),
    });
    expect(submittedResponse.status).toBe(201);
    const submitted = (await submittedResponse.json()) as ReviewResponse;
    expect(submitted.status).toBe('pending');

    const detailUrl = `/api/admin/reviews/${submitted.id}`;
    expect((await app.request(detailUrl)).status).toBe(401);
    expect((await app.request(detailUrl, { headers: { cookie: visitor.cookie } })).status).toBe(
      403,
    );
    const detail = await app.request(detailUrl, { headers: { cookie: admin.cookie } });
    expect(detail.status).toBe(200);
    await expect(detail.json()).resolves.toMatchObject({
      review: { id: submitted.id },
      history: [{ action: 'submit' }],
    });
    expect(
      (
        await app.request(`${detailUrl}/publish`, {
          method: 'POST',
          headers: { cookie: admin.cookie },
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await app.request(`${detailUrl}/publish?expectedRevision=`, {
          method: 'POST',
          headers: { cookie: admin.cookie },
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await app.request(`${detailUrl}/publish?expectedRevision=99`, {
          method: 'POST',
          headers: { cookie: admin.cookie },
        })
      ).status,
    ).toBe(409);

    const beforePublish = await app.request(`/api/reviews?designerProfileId=${designer.id}`);
    expect(beforePublish.status).toBe(200);
    await expect(beforePublish.json()).resolves.toMatchObject({
      items: [],
      reviewCount: 0,
    });

    const publishResponse = await app.request(
      `/api/admin/reviews/${submitted.id}/publish?expectedRevision=${submitted.moderationRevision}`,
      {
        method: 'POST',
        headers: { cookie: admin.cookie },
      },
    );
    expect(publishResponse.status).toBe(200);

    const afterPublish = await app.request(`/api/reviews?designerProfileId=${designer.id}`);
    expect(afterPublish.status).toBe(200);
    await expect(afterPublish.json()).resolves.toMatchObject({
      items: [{ id: submitted.id, status: 'published' }],
      averageRating: 5,
      reviewCount: 1,
    });
  });

  it('requires authentication for review submission', async () => {
    const designer = await makeDesigner({ status: 'active' });
    const response = await app.request('/api/reviews', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        designerProfileId: designer.id,
        rating: 5,
        body: 'This valid body still cannot be submitted without an authenticated user.',
      }),
    });
    expect(response.status).toBe(401);
  });

  it('rejects the admin queue for a non-admin session', async () => {
    const visitor = await createRoleSession('+919800004103', 'visitor');
    const response = await app.request('/api/admin/reviews', {
      headers: { cookie: visitor.cookie },
    });
    expect(response.status).toBe(403);
  });

  it('requires reasons and keeps rejected review notes behind the admin detail guard', async () => {
    const designer = await makeDesigner({ status: 'active' });
    const visitor = await createRoleSession('+919800004104', 'visitor');
    const admin = await createRoleSession('+919800004105', 'admin');
    const submittedResponse = await app.request('/api/reviews', {
      method: 'POST',
      headers: { cookie: visitor.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ designerProfileId: designer.id, rating: 1 }),
    });
    const submitted = (await submittedResponse.json()) as ReviewResponse;
    const url = `/api/admin/reviews/${submitted.id}`;
    for (const [action, body] of [
      ['reject', { note: ' ', reasonCode: 'spam' }],
      ['resolve-dispute', { decision: 'remove', note: ' ' }],
    ] as const) {
      const response = await app.request(`${url}/${action}?expectedRevision=0`, {
        method: 'POST',
        headers: { cookie: admin.cookie, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(422);
    }
    const rejected = await app.request(
      `${url}/reject?expectedRevision=${submitted.moderationRevision}`,
      {
        method: 'POST',
        headers: { cookie: admin.cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ note: 'Private evidence', reasonCode: 'spam' }),
      },
    );
    expect(rejected.status).toBe(200);
    expect(await rejected.json()).not.toHaveProperty('history');
    const detail = await app.request(url, { headers: { cookie: admin.cookie } });
    await expect(detail.json()).resolves.toMatchObject({
      history: expect.arrayContaining([
        expect.objectContaining({ note: 'Private evidence', reasonCode: 'spam' }),
      ]),
    });
    const publicResponse = await app.request(`/api/reviews?designerProfileId=${designer.id}`);
    expect(await publicResponse.text()).not.toContain('Private evidence');
  });
});
