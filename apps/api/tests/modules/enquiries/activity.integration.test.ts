import { randomUUID } from 'node:crypto';
import {
  enquiryResponseSchema,
  enquiryMessageSchema,
  listEnquiriesResponseSchema,
} from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { db, eq, schema } from '@repo/db';
import { makeDesigner } from '@repo/db/testing';
import { app } from '../../../src/app.js';
import { activateOrganization, createRoleSession } from '../../helpers/auth.js';

async function setup() {
  const owner = await createRoleSession('+919800007010', 'designer');
  const visitor = await createRoleSession('+919800007011', 'visitor');
  const studio = await makeDesigner({ userId: owner.userId, status: 'active' });
  await db.insert(schema.member).values({
    id: `owner-${owner.userId}`,
    organizationId: studio.orgId,
    userId: owner.userId,
    role: 'owner',
    createdAt: new Date(),
  });
  const ownerCookie = await activateOrganization(owner.cookie, studio.orgId);
  const response = await app.request('/api/enquiries', {
    method: 'POST',
    headers: { cookie: visitor.cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      designerProfileId: studio.id,
      subject: 'Real message workflow',
      description: 'Please discuss my project.',
      budget: '10l-20l',
    }),
  });
  expect(response.status).toBe(201);
  const enquiry = enquiryResponseSchema.parse(await response.json());
  const [record] = await db.select().from(schema.enquiry).where(eq(schema.enquiry.id, enquiry.id));
  return { visitor, ownerCookie, record: record! };
}
describe('enquiry milestone and messaging integration', () => {
  it('records actual viewed and studio-reply events once, preserves retry idempotency, and acknowledges only the requester', async () => {
    const { visitor, ownerCookie, record } = await setup();
    const leadPath = `/api/leads/${record.leadId}`;
    const headers = { cookie: ownerCookie, 'content-type': 'application/json' };
    // A GET/prefetch is not a view. Nor is marking a lead Contacted a message.
    await app.request(leadPath, { headers });
    await app.request(leadPath, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: 'contacted' }),
    });
    let [stored] = await db.select().from(schema.enquiry).where(eq(schema.enquiry.id, record.id));
    expect(stored?.viewedAt).toBeNull();
    expect(stored?.contactedAt).toBeNull();
    expect((await app.request(`${leadPath}/viewed`, { method: 'POST', headers })).status).toBe(200);
    [stored] = await db.select().from(schema.enquiry).where(eq(schema.enquiry.id, record.id));
    const firstViewed = stored!.viewedAt;
    await app.request(`${leadPath}/viewed`, { method: 'POST', headers });
    [stored] = await db.select().from(schema.enquiry).where(eq(schema.enquiry.id, record.id));
    expect(stored?.viewedAt).toEqual(firstViewed);
    const message = {
      body: 'We can help with your project. Please share your plans.',
      requestId: randomUUID(),
    };
    const send = () =>
      app.request(`${leadPath}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify(message),
      });
    const results = await Promise.all([send(), send()]);
    expect(results.map((result) => result.status)).toEqual([200, 200]);
    expect(enquiryMessageSchema.parse(await results[0]!.json()).id).toBe(
      enquiryMessageSchema.parse(await results[1]!.json()).id,
    );
    expect(await db.select().from(schema.enquiryMessage)).toHaveLength(1);
    const mine = listEnquiriesResponseSchema.parse(
      await (
        await app.request('/api/enquiries/mine', { headers: { cookie: visitor.cookie } })
      ).json(),
    );
    expect(mine.items[0]).toMatchObject({
      activity: {
        viewedAt: expect.any(String),
        contactedAt: expect.any(String),
        lastMessageAt: expect.any(String),
        isNew: true,
      },
      status: 'responded',
    });
    expect(
      await (
        await app.request('/api/enquiries/counts', { headers: { cookie: visitor.cookie } })
      ).json(),
    ).toEqual({ total: 1, unread: 1 });
    const other = await createRoleSession('+919800007012', 'visitor');
    expect(
      (
        await app.request(`/api/enquiries/${record.id}/messages`, {
          headers: { cookie: other.cookie },
        })
      ).status,
    ).toBe(404);
    expect(
      (await app.request(`${leadPath}/messages`, { headers: { cookie: visitor.cookie } })).status,
    ).toBe(403);
    const thread = await app.request(`/api/enquiries/${record.id}/messages`, {
      headers: { cookie: visitor.cookie },
    });
    expect(thread.headers.get('cache-control')).toBe('private, no-store');
    expect(await thread.json()).toMatchObject({
      canReply: false,
      messages: [{ body: message.body }],
    });
    const read = await app.request(`/api/enquiries/${record.id}/read`, {
      method: 'POST',
      headers: { cookie: visitor.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ through: mine.items[0]!.activity!.readThrough }),
    });
    expect(read.status).toBe(200);
    const after = listEnquiriesResponseSchema.parse(
      await (
        await app.request('/api/enquiries/mine', { headers: { cookie: visitor.cookie } })
      ).json(),
    );
    expect(after.items[0]!.activity?.isNew).toBe(false);
    expect(
      await (
        await app.request('/api/enquiries/counts', { headers: { cookie: visitor.cookie } })
      ).json(),
    ).toEqual({ total: 1, unread: 0 });
    expect(
      (
        await app.request(`${leadPath}/messages`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...message, body: 'Different text' }),
        })
      ).status,
    ).toBe(409);
  });
  it('rejects empty replies and closed enquiries without recording contact or losing a successful retry', async () => {
    const { ownerCookie, record } = await setup();
    const headers = { cookie: ownerCookie, 'content-type': 'application/json' };
    const leadPath = `/api/leads/${record.leadId}`;
    expect(
      (
        await app.request(`${leadPath}/messages`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ body: ' ', requestId: randomUUID() }),
        })
      ).status,
    ).toBe(422);
    await app.request(leadPath, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: 'closed' }),
    });
    expect(
      (
        await app.request(`${leadPath}/messages`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ body: 'A reply', requestId: randomUUID() }),
        })
      ).status,
    ).toBe(409);
    const [stored] = await db.select().from(schema.enquiry).where(eq(schema.enquiry.id, record.id));
    expect(stored?.contactedAt).toBeNull();
    expect(await db.select().from(schema.enquiryMessage)).toHaveLength(0);
  });
  it('rejects another studio from viewing or replying to the enquiry', async () => {
    const { record } = await setup();
    const outsider = await createRoleSession('+919800007013', 'designer');
    const studio = await makeDesigner({ userId: outsider.userId, status: 'active' });
    await db.insert(schema.member).values({
      id: `owner-${outsider.userId}`,
      organizationId: studio.orgId,
      userId: outsider.userId,
      role: 'owner',
      createdAt: new Date(),
    });
    const cookie = await activateOrganization(outsider.cookie, studio.orgId);
    for (const suffix of ['viewed', 'messages'])
      expect(
        (
          await app.request(`/api/leads/${record.leadId}/${suffix}`, {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json' },
            body:
              suffix === 'messages'
                ? JSON.stringify({ body: 'Forged reply', requestId: randomUUID() })
                : undefined,
          })
        ).status,
      ).toBe(404);
  });
});
