import { describe, expect, it } from 'vitest';
import { db, eq, schema, sql } from '@repo/db';
import { enquiryThreadSchema, listEnquiriesResponseSchema } from '@repo/contracts';
import { makeDesigner } from '@repo/db/testing';
import { app } from '../../../src/app.js';
import { createRoleSession } from '../../helpers/auth.js';

describe('enquiry unread counts', () => {
  it('clears the exact displayed activity without losing newer replies within the same millisecond', async () => {
    const visitor = await createRoleSession('+919800007024', 'visitor');
    const studio = await makeDesigner({ status: 'active' });
    const [enquiry] = await db
      .insert(schema.enquiry)
      .values({
        requesterId: visitor.userId,
        designerProfileId: studio.id,
        organizationId: studio.orgId,
        subject: 'Precision regression',
        description: 'Synthetic enquiry',
        budget: '10l-20l',
        createdAt: sql`'2026-10-01T00:00:00.123456Z'::timestamptz`,
      })
      .returning({ id: schema.enquiry.id });
    const headers = { cookie: visitor.cookie, 'content-type': 'application/json' };
    const list = async () =>
      listEnquiriesResponseSchema.parse(
        await (await app.request('/api/enquiries/mine', { headers })).json(),
      ).items[0]!;
    const counts = async () => (await app.request('/api/enquiries/counts', { headers })).json();
    const read = (through: string) =>
      app.request(`/api/enquiries/${enquiry!.id}/read`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ through }),
      });
    const first = await list();
    expect(first.activity?.readThrough).toBe('2026-10-01T00:00:00.123456Z');
    expect((await read(first.activity!.readThrough!)).status).toBe(200);
    expect(await counts()).toEqual({ total: 1, unread: 0 });
    expect((await list()).activity?.isNew).toBe(false);
    const replyAt = '2026-10-01T00:00:00.123457Z';
    await db.insert(schema.enquiryMessage).values({
      enquiryId: enquiry!.id,
      authorId: visitor.userId,
      requestId: '11111111-1111-4111-8111-111111111114',
      body: 'A later reply in the same millisecond',
      createdAt: sql`${replyAt}::timestamptz`,
    });
    await db
      .update(schema.enquiry)
      .set({ lastMessageAt: sql`${replyAt}::timestamptz` })
      .where(eq(schema.enquiry.id, enquiry!.id));
    expect(await counts()).toEqual({ total: 1, unread: 1 });
    expect((await list()).activity?.isNew).toBe(true);
    await read(first.activity!.readThrough!);
    expect(await counts()).toEqual({ total: 1, unread: 1 });
    const thread = enquiryThreadSchema.parse(
      await (await app.request(`/api/enquiries/${enquiry!.id}/messages`, { headers })).json(),
    );
    expect(thread.readThrough).toBe(replyAt);
    await read(thread.readThrough!);
    expect(await counts()).toEqual({ total: 1, unread: 0 });
    expect((await list()).activity?.isNew).toBe(false);
    await read(first.activity!.readThrough!);
    expect(await counts()).toEqual({ total: 1, unread: 0 });
  });

  it('counts unread enquiries across every page, not messages or other accounts', async () => {
    const visitor = await createRoleSession('+919800007020', 'visitor');
    const other = await createRoleSession('+919800007021', 'visitor');
    const studio = await makeDesigner({ status: 'active' });
    const createdAt = new Date('2026-10-01T00:00:00Z');
    const readAt = new Date('2026-10-02T00:00:00Z');
    const newAt = new Date('2026-10-03T00:00:00Z');
    const base = {
      requesterId: visitor.userId,
      designerProfileId: studio.id,
      organizationId: studio.orgId,
      subject: 'Counts fixture',
      description: 'Synthetic enquiry',
      budget: '10l-20l',
      createdAt,
    };
    await db.insert(schema.enquiry).values([
      { ...base, activityReadAt: readAt },
      { ...base },
      { ...base, viewedAt: newAt, activityReadAt: readAt },
      { ...base, viewedAt: newAt, lastMessageAt: newAt, activityReadAt: readAt },
      { ...base, viewedAt: newAt, lastMessageAt: newAt, activityReadAt: newAt },
      { ...base, status: 'closed', activityReadAt: readAt },
      { ...base, requesterId: other.userId },
      ...Array.from({ length: 15 }, () => ({
        ...base,
        createdAt: new Date('2026-10-04T00:00:00Z'),
        activityReadAt: new Date('2026-10-05T00:00:00Z'),
      })),
    ]);
    const response = await app.request('/api/enquiries/counts', {
      headers: { cookie: visitor.cookie },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ total: 21, unread: 3 });
    const firstPage = await app.request('/api/enquiries/mine?page=1&limit=1', {
      headers: { cookie: visitor.cookie },
    });
    expect(
      listEnquiriesResponseSchema.parse(await firstPage.json()).items[0]?.activity?.isNew,
    ).toBe(false);
    const empty = await createRoleSession('+919800007022', 'visitor');
    expect(
      await (
        await app.request('/api/enquiries/counts', { headers: { cookie: empty.cookie } })
      ).json(),
    ).toEqual({ total: 0, unread: 0 });
  });

  it('requires an authenticated customer', async () => {
    expect((await app.request('/api/enquiries/counts')).status).toBe(401);
    const admin = await createRoleSession('+919800007023', 'admin');
    expect(
      (await app.request('/api/enquiries/counts', { headers: { cookie: admin.cookie } })).status,
    ).toBe(403);
  });
});
