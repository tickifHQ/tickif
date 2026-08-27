import { describe, expect, it } from 'vitest';
import { and, db, eq, schema, sql } from '@repo/db';
import { makeDesigner, makeUser } from '@repo/db/testing';
import { app } from '../../../src/app.js';
import { createRoleSession } from '../../helpers/auth.js';

describe('enquiry ownership protection', () => {
  it('reports an owned studio as unavailable and rejects a forged self-enquiry', async () => {
    const { cookie, userId } = await createRoleSession('+919800004301', 'designer');
    const creator = await makeUser();
    const designer = await makeDesigner({
      userId: creator.id,
      status: 'active',
      displayName: 'Owned Studio',
    });
    await db.insert(schema.member).values({
      id: `enquiry-member-${userId}`,
      organizationId: designer.orgId,
      userId,
      role: 'owner',
      createdAt: new Date(),
    });

    const checkResponse = await app.request(
      `/api/enquiries/check?designerProfileId=${designer.id}`,
      { headers: { cookie } },
    );

    expect(checkResponse.status).toBe(200);
    expect(await checkResponse.json()).toEqual({
      canEnquire: false,
      unavailableReason: 'own_studio',
      exists: false,
      enquiryId: null,
    });

    const createResponse = await app.request('/api/enquiries', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        designerProfileId: designer.id,
        subject: 'Self enquiry',
        description: 'This request must never create a lead or enquiry.',
        budget: 'premium',
      }),
    });

    expect(createResponse.status).toBe(403);
    expect(await createResponse.json()).toMatchObject({
      error: { message: 'You cannot send an enquiry to your own studio' },
    });

    const [enquiryCount] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(schema.enquiry)
      .where(
        and(
          eq(schema.enquiry.requesterId, userId),
          eq(schema.enquiry.designerProfileId, designer.id),
        ),
      );
    const [leadCount] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(schema.lead)
      .where(eq(schema.lead.organizationId, designer.orgId));

    expect(enquiryCount?.value).toBe(0);
    expect(leadCount?.value).toBe(0);
  });

  it('rejects the profile owner without relying on an organization member row', async () => {
    const { cookie, userId } = await createRoleSession('+919800004304', 'designer');
    const designer = await makeDesigner({
      userId,
      status: 'active',
      displayName: 'Creator Studio',
    });

    const checkResponse = await app.request(
      `/api/enquiries/check?designerProfileId=${designer.id}`,
      { headers: { cookie } },
    );

    expect(checkResponse.status).toBe(200);
    expect(await checkResponse.json()).toEqual({
      canEnquire: false,
      unavailableReason: 'own_studio',
      exists: false,
      enquiryId: null,
    });

    const createResponse = await app.request('/api/enquiries', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        designerProfileId: designer.id,
        subject: 'Self enquiry',
        description: 'The profile owner must not create an enquiry for their own studio.',
        budget: 'premium',
      }),
    });

    expect(createResponse.status).toBe(403);
    expect(await createResponse.json()).toMatchObject({
      error: { message: 'You cannot send an enquiry to your own studio' },
    });

    const [enquiryCount] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(schema.enquiry)
      .where(
        and(
          eq(schema.enquiry.requesterId, userId),
          eq(schema.enquiry.designerProfileId, designer.id),
        ),
      );
    const [leadCount] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(schema.lead)
      .where(eq(schema.lead.organizationId, designer.orgId));

    expect(enquiryCount?.value).toBe(0);
    expect(leadCount?.value).toBe(0);
  });

  it('still creates one enquiry and its lead for an unrelated visitor', async () => {
    const designer = await makeDesigner({
      status: 'active',
      displayName: 'Independent Studio',
    });
    const { cookie, userId } = await createRoleSession('+919800004302', 'visitor');

    const response = await app.request('/api/enquiries', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        designerProfileId: designer.id,
        subject: 'Renovation enquiry',
        description: 'I would like to discuss a full-home renovation.',
        budget: 'premium',
      }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      designerProfile: { id: designer.id, displayName: 'Independent Studio' },
      status: 'open',
    });

    const [enquiryCount] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(schema.enquiry)
      .where(eq(schema.enquiry.requesterId, userId));
    const [leadCount] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(schema.lead)
      .where(eq(schema.lead.organizationId, designer.orgId));

    expect(enquiryCount?.value).toBe(1);
    expect(leadCount?.value).toBe(1);
  });

  it('keeps concurrent duplicate submissions to one enquiry and one lead', async () => {
    const designer = await makeDesigner({ status: 'active' });
    const { cookie, userId } = await createRoleSession('+919800004303', 'visitor');
    const request = () =>
      app.request('/api/enquiries', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          designerProfileId: designer.id,
          subject: 'Concurrent enquiry',
          description: 'This should only be recorded once.',
          budget: 'premium',
        }),
      });

    const responses = await Promise.all([request(), request()]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const [enquiryCount] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(schema.enquiry)
      .where(eq(schema.enquiry.requesterId, userId));
    const [leadCount] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(schema.lead)
      .where(eq(schema.lead.organizationId, designer.orgId));

    expect(enquiryCount?.value).toBe(1);
    expect(leadCount?.value).toBe(1);
  });
});
