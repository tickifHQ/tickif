import { randomUUID } from 'node:crypto';
import {
  checkEnquiryResponseSchema,
  enquiryResponseSchema,
  listEnquiriesResponseSchema,
} from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { db, eq, schema, sql } from '@repo/db';
import { makeDesigner, makeProject } from '@repo/db/testing';
import { app } from '../../../src/app.js';
import { createRoleSession } from '../../helpers/auth.js';

async function ownerSession(phoneNumber: string) {
  const { cookie, userId } = await createRoleSession(phoneNumber, 'designer');
  const designer = await makeDesigner({ userId, status: 'active' });
  await db.insert(schema.member).values({
    id: `lifecycle-owner-${userId}`,
    organizationId: designer.orgId,
    userId,
    role: 'owner',
    createdAt: new Date(),
  });
  await db
    .update(schema.session)
    .set({ activeOrganizationId: designer.orgId, activeTeamId: designer.teamId })
    .where(eq(schema.session.userId, userId));
  return { cookie, userId, designer };
}

function send(path: string, cookie: string, method: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { cookie, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function enquire(cookie: string, designerProfileId: string, referredProjectId?: string) {
  return send('/api/enquiries', cookie, 'POST', {
    designerProfileId,
    referredProjectId,
    subject: 'Kitchen',
    description: 'Need a modular kitchen',
    budget: 'premium',
  });
}

async function leadIdFor(enquiryId: string) {
  const [row] = await db
    .select({ leadId: schema.enquiry.leadId })
    .from(schema.enquiry)
    .where(eq(schema.enquiry.id, enquiryId));
  return row!.leadId!;
}

async function enquiryCount(requesterId: string) {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(schema.enquiry)
    .where(eq(schema.enquiry.requesterId, requesterId));
  return row?.value ?? 0;
}

describe('enquiry lifecycle follows the studio lead', () => {
  it.each(['closed', 'spam'] as const)(
    'closes the enquiry when the lead is marked %s, so the customer can enquire again',
    async (status) => {
      const owner = await ownerSession('+919800008001');
      const customer = await createRoleSession('+919800008002', 'visitor');
      const created = await enquire(customer.cookie, owner.designer.id);
      expect(created.status).toBe(201);
      const enquiry = enquiryResponseSchema.parse(await created.json());
      const leadId = await leadIdFor(enquiry.id);

      const closed = await send(`/api/leads/${leadId}`, owner.cookie, 'PATCH', { status });
      expect(closed.status).toBe(200);

      const mine = listEnquiriesResponseSchema.parse(
        await (await send('/api/enquiries/mine?status=all', customer.cookie, 'GET')).json(),
      );
      expect(mine.items.map((item) => item.status)).toEqual(['closed']);
      const check = checkEnquiryResponseSchema.parse(
        await (
          await send(
            `/api/enquiries/check?designerProfileId=${owner.designer.id}`,
            customer.cookie,
            'GET',
          )
        ).json(),
      );
      expect(check).toMatchObject({ canEnquire: true, unavailableReason: null });
      expect((await enquire(customer.cookie, owner.designer.id)).status).toBe(201);
      expect(await enquiryCount(customer.userId)).toBe(2);
    },
  );

  it('keeps a closed enquiry closed when the lead is reopened, until the studio replies', async () => {
    const owner = await ownerSession('+919800008003');
    const customer = await createRoleSession('+919800008004', 'visitor');
    const enquiry = enquiryResponseSchema.parse(
      await (await enquire(customer.cookie, owner.designer.id)).json(),
    );
    const leadId = await leadIdFor(enquiry.id);
    await send(`/api/leads/${leadId}`, owner.cookie, 'PATCH', { status: 'closed' });

    const reopened = await send(`/api/leads/${leadId}`, owner.cookie, 'PATCH', {
      status: 'contacted',
    });
    expect(reopened.status).toBe(200);
    const [afterReopen] = await db
      .select({ status: schema.enquiry.status })
      .from(schema.enquiry)
      .where(eq(schema.enquiry.id, enquiry.id));
    expect(afterReopen?.status).toBe('closed');

    const reply = await send(`/api/leads/${leadId}/messages`, owner.cookie, 'POST', {
      body: 'We reopened your enquiry.',
      requestId: randomUUID(),
    });
    expect(reply.status).toBe(200);
    const [afterReply] = await db
      .select({ status: schema.enquiry.status })
      .from(schema.enquiry)
      .where(eq(schema.enquiry.id, enquiry.id));
    expect(afterReply?.status).toBe('responded');
  });
});

describe('enquiries to frozen branches', () => {
  it('rejects the enquiry with a clear message and keeps the frozen lead hidden by id', async () => {
    const owner = await ownerSession('+919800008011');
    const customer = await createRoleSession('+919800008012', 'visitor');
    const earlier = enquiryResponseSchema.parse(
      await (await enquire(customer.cookie, owner.designer.id)).json(),
    );
    const earlierLeadId = await leadIdFor(earlier.id);
    await db
      .update(schema.team)
      .set({ frozen: true, frozenAt: new Date(), freezeRank: 1 })
      .where(eq(schema.team.id, owner.designer.teamId));
    await db
      .update(schema.session)
      .set({ activeTeamId: null })
      .where(eq(schema.session.userId, owner.userId));
    const secondCustomer = await createRoleSession('+919800008013', 'visitor');

    const rejected = await enquire(secondCustomer.cookie, owner.designer.id);

    expect(rejected.status).toBe(422);
    expect(await rejected.json()).toMatchObject({
      error: { message: 'This studio branch is not accepting enquiries right now' },
    });
    expect(await enquiryCount(secondCustomer.userId)).toBe(0);
    const detail = await send(`/api/leads/${earlierLeadId}`, owner.cookie, 'GET');
    expect(detail.status).toBe(404);
  });
});

describe('enquiry referred project', () => {
  it('rejects another studio draft without echoing its title', async () => {
    const owner = await ownerSession('+919800008021');
    const otherStudio = await makeDesigner({ status: 'active' });
    const draft = await makeProject({
      designerId: otherStudio.id,
      status: 'draft',
      title: 'Secret unreleased villa',
    });
    const customer = await createRoleSession('+919800008022', 'visitor');

    const response = await enquire(customer.cookie, owner.designer.id, draft.id);

    expect(response.status).toBe(422);
    expect(JSON.stringify(await response.json())).not.toContain('Secret unreleased villa');
    expect(await enquiryCount(customer.userId)).toBe(0);
  });

  it.each(['draft', 'published-elsewhere'] as const)(
    'rejects a %s project reference for the receiving studio',
    async (kind) => {
      const owner = await ownerSession('+919800008023');
      const project =
        kind === 'draft'
          ? await makeProject({ designerId: owner.designer.id, status: 'draft' })
          : await makeProject({ designerId: (await makeDesigner({ status: 'active' })).id });
      const customer = await createRoleSession('+919800008024', 'visitor');

      expect((await enquire(customer.cookie, owner.designer.id, project.id)).status).toBe(422);
    },
  );

  it('accepts a published project from the receiving studio', async () => {
    const owner = await ownerSession('+919800008025');
    const project = await makeProject({ designerId: owner.designer.id, title: 'Sea view flat' });
    const customer = await createRoleSession('+919800008026', 'visitor');

    const response = await enquire(customer.cookie, owner.designer.id, project.id);

    expect(response.status).toBe(201);
    expect(enquiryResponseSchema.parse(await response.json())).toMatchObject({
      referredProjectId: project.id,
      referredProjectTitle: 'Sea view flat',
    });
  });
});
