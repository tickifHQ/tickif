import { describe, expect, it } from 'vitest';
import { db, eq, schema } from '@repo/db';
import { makeDesigner, makeOrganization, makeProject, makeTeam, makeUser } from '@repo/db/testing';
import {
  adminEntityResponseSchema,
  adminLeadDetailSchema,
  adminLeadResponseSchema,
  adminReportResponseSchema,
} from '@repo/contracts';
import { app } from '../../../src/app.js';
import { createRoleSession } from '../../helpers/auth.js';

const from = '2026-10-11';
const to = '2026-10-11';
const included = new Date('2026-10-10T18:30:00Z');
async function fixture() {
  const admin = await createRoleSession('+919800005601', 'admin');
  const company = await makeOrganization({ name: 'Alpha Studio' });
  const other = await makeOrganization({ name: 'Beta Studio' });
  const designer = await makeDesigner({ orgId: company.id, displayName: 'Alpha designer' });
  const secondTeam = await makeTeam({
    organizationId: company.id,
    name: 'Second branch',
    frozen: true,
    frozenAt: included,
    freezeRank: 1,
  });
  const second = await makeDesigner({
    orgId: company.id,
    teamId: secondTeam.id,
    displayName: 'Alpha second branch',
  });
  const outsider = await makeDesigner({ orgId: other.id });
  const requester = await makeUser({ name: 'Asha Rao', phoneNumber: '+919811112222' });
  const project = await makeProject({ designerId: designer.id, createdAt: included });
  const user = await makeUser({ name: 'Lead manager' });
  const [member] = await db
    .insert(schema.member)
    .values({
      id: 'admin-visibility-assignee',
      organizationId: company.id,
      userId: user.id,
      role: 'owner',
      createdAt: included,
    })
    .returning();
  async function insert(
    profile: typeof designer,
    status: 'new' | 'contacted' | 'closed' | 'spam',
    receivedAt = included,
    actualResponse = false,
  ) {
    const [lead] = await db
      .insert(schema.lead)
      .values({
        organizationId: profile.orgId,
        teamId: profile.teamId,
        referredProjectId: project.id,
        name: 'Lead \\_%',
        contactNumber: '+919811112222',
        budgetBandSlug: '10-15 lakh',
        message: 'Original request',
        notes: 'Internal note',
        source: 'enquiry',
        status,
        assignedMemberId: profile.orgId === company.id ? member!.id : null,
        receivedAt,
        createdAt: receivedAt,
        updatedAt: receivedAt,
      })
      .returning();
    const [enquiry] = await db
      .insert(schema.enquiry)
      .values({
        requesterId: requester.id,
        designerProfileId: profile.id,
        organizationId: profile.orgId,
        leadId: lead!.id,
        subject: 'Renovation',
        description: 'Full enquiry description',
        budget: '10-15 lakh',
        timeline: 'This winter',
        status: status === 'closed' ? 'closed' : 'responded',
        contactedAt: actualResponse ? new Date('2026-10-15T09:00:00Z') : null,
        createdAt: receivedAt,
        updatedAt: receivedAt,
      })
      .returning();
    return { lead: lead!, enquiry: enquiry! };
  }
  const first = await insert(designer, 'closed', included, true);
  await insert(designer, 'new'); // Historical responded status does not invent a message milestone.
  await insert(second, 'contacted');
  await insert(outsider, 'spam');
  await insert(designer, 'new', new Date('2026-10-10T18:29:59Z'));
  await insert(designer, 'new', new Date('2026-10-11T18:30:00Z'));
  await db.insert(schema.enquiryMessage).values([
    {
      enquiryId: first.enquiry.id,
      authorId: user.id,
      requestId: '11111111-1111-4111-8111-111111111111',
      body: 'First studio response',
      createdAt: new Date('2026-10-15T09:00:00Z'),
    },
    {
      enquiryId: first.enquiry.id,
      authorId: user.id,
      requestId: '22222222-2222-4222-8222-222222222222',
      body: 'Follow-up response',
      createdAt: new Date('2026-10-16T09:00:00Z'),
    },
  ]);
  await db.insert(schema.interactionEvent).values([
    {
      eventKey: '33333333-3333-4333-8333-333333333333',
      type: 'project_view',
      anonymousId: '44444444-4444-4444-8444-444444444444',
      projectId: project.id,
      createdAt: included,
      eventDay: '2026-10-10',
    },
    {
      eventKey: '55555555-5555-4555-8555-555555555555',
      type: 'profile_view',
      anonymousId: '66666666-6666-4666-8666-666666666666',
      designerProfileId: designer.id,
      createdAt: included,
      eventDay: '2026-10-10',
    },
  ]);
  const scope = `from=${from}&to=${to}&organizationId=${company.id}`;
  return { admin, company, other, designer, second, first, scope };
}
describe('admin visibility API', () => {
  it('guards every data route against anonymous and ordinary users, and accepts superadmins', async () => {
    const paths = [
      'report',
      'entities',
      'companies',
      'leads',
      'leads/11111111-1111-4111-8111-111111111111',
    ];
    for (const path of paths)
      expect((await app.request(`/api/admin/insights/${path}`)).status).toBe(401);
    for (const role of ['visitor', 'designer'] as const) {
      const session = await createRoleSession(
        role === 'visitor' ? '+919800005602' : '+919800005603',
        role,
      );
      for (const path of paths)
        expect(
          (
            await app.request(`/api/admin/insights/${path}`, {
              headers: { cookie: session.cookie },
            })
          ).status,
        ).toBe(403);
    }
    const superadmin = await createRoleSession('+919800005604', 'superadmin');
    expect(
      (await app.request('/api/admin/insights/report', { headers: { cookie: superadmin.cookie } }))
        .status,
    ).toBe(200);
  });
  it('reports an India-time submission cohort with later actual responses and no multiplied facts', async () => {
    const f = await fixture();
    const response = await app.request(`/api/admin/insights/report?${f.scope}`, {
      headers: { cookie: f.admin.cookie },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const report = adminReportResponseSchema.parse(await response.json());
    expect(report.metrics).toMatchObject({
      leads: 3,
      enquiries: 3,
      respondedEnquiries: 1,
      progressedEnquiries: 2,
      new: 1,
      contacted: 1,
      closed: 1,
      spam: 0,
      projectViews: 1,
      profileViews: 1,
      projectsCreated: 1,
    });
    expect(report.metrics.responseRate).toBeCloseTo(100 / 3);
    expect(report.metrics.conversionRate).toBeCloseTo(200 / 3);
    expect(report.activity).toEqual([{ date: from, enquiries: 3, responded: 1, progressed: 2 }]);
  });
  it('drills into all company branches and a single designer without requiring org membership', async () => {
    const f = await fixture();
    const response = await app.request(
      `/api/admin/insights/entities?${f.scope}&groupBy=designer&limit=1`,
      { headers: { cookie: f.admin.cookie } },
    );
    expect(response.status).toBe(200);
    const data = adminEntityResponseSchema.parse(await response.json());
    expect(data).toMatchObject({
      total: 2,
      totalPages: 2,
      items: [{ id: f.designer.id, metrics: { enquiries: 2, respondedEnquiries: 1 } }],
    });
    const detail = await app.request(
      `/api/admin/insights/report?${f.scope}&designerId=${f.second.id}`,
      { headers: { cookie: f.admin.cookie } },
    );
    expect(adminReportResponseSchema.parse(await detail.json()).metrics).toMatchObject({
      leads: 1,
      enquiries: 1,
      contacted: 1,
      projectViews: 0,
    });
    const mismatch = await app.request(
      `/api/admin/insights/report?from=${from}&to=${to}&organizationId=${f.other.id}&designerId=${f.designer.id}`,
      { headers: { cookie: f.admin.cookie } },
    );
    expect(mismatch.status).toBe(404);
  });
  it('filters all lead stages while retaining scoped pipeline totals, literal searches and paging', async () => {
    const f = await fixture();
    const response = await app.request(
      `/api/admin/insights/leads?${f.scope}&status=closed&limit=1&q=${encodeURIComponent('\\_%')}`,
      { headers: { cookie: f.admin.cookie } },
    );
    expect(response.status).toBe(200);
    const result = adminLeadResponseSchema.parse(await response.json());
    expect(result).toMatchObject({
      total: 1,
      pipeline: { total: 3, new: 1, contacted: 1, closed: 1, spam: 0 },
      items: [
        {
          id: f.first.lead.id,
          company: { name: 'Alpha Studio' },
          assignedMember: { name: 'Lead manager' },
        },
      ],
    });
    const page = await app.request(`/api/admin/insights/leads?${f.scope}&limit=1&page=2`, {
      headers: { cookie: f.admin.cookie },
    });
    expect(adminLeadResponseSchema.parse(await page.json())).toMatchObject({
      page: 2,
      total: 3,
      items: [expect.any(Object)],
    });
  });
  it('reads complete lead details and every message page without mutating viewed/read milestones', async () => {
    const f = await fixture();
    const request = (page: number) =>
      app.request(`/api/admin/insights/leads/${f.first.lead.id}?page=${page}&limit=1`, {
        headers: { cookie: f.admin.cookie },
      });
    const response = await request(1);
    const detail = adminLeadDetailSchema.parse(await response.json());
    expect(detail).toMatchObject({
      message: 'Original request',
      notes: 'Internal note',
      createdAt: included.toISOString(),
      updatedAt: included.toISOString(),
      enquiry: {
        description: 'Full enquiry description',
        requester: { name: 'Asha Rao', phone: '+919811112222' },
        viewedAt: null,
      },
      messages: {
        total: 2,
        totalPages: 2,
        items: [{ body: 'First studio response', author: { name: 'Lead manager' } }],
      },
    });
    expect(
      adminLeadDetailSchema.parse(await (await request(2)).json()).messages.items[0]?.body,
    ).toBe('Follow-up response');
    const [unchanged] = await db
      .select()
      .from(schema.enquiry)
      .where(eq(schema.enquiry.id, f.first.enquiry.id));
    expect(unchanged?.viewedAt).toBeNull();
    expect(unchanged?.activityReadAt).toBeNull();
    const team = await makeTeam({ organizationId: f.company.id, name: 'Manual branch' });
    const [manual] = await db
      .insert(schema.lead)
      .values({
        organizationId: f.company.id,
        teamId: team.id,
        name: 'Manual lead',
        contactNumber: '12345678',
        source: 'manual',
      })
      .returning();
    const manualResponse = await app.request(`/api/admin/insights/leads/${manual!.id}`, {
      headers: { cookie: f.admin.cookie },
    });
    expect(adminLeadDetailSchema.parse(await manualResponse.json())).toMatchObject({
      enquiry: null,
      designer: null,
      messages: { total: 0, items: [] },
    });
  });
  it('rejects invalid filters, reports missing leads, and returns empty cohorts with zero rates', async () => {
    const admin = await createRoleSession('+919800005605', 'admin');
    const headers = { cookie: admin.cookie };
    expect(
      (await app.request('/api/admin/insights/leads?from=2026-10-11&to=2026-10-10', { headers }))
        .status,
    ).toBe(422);
    expect((await app.request('/api/admin/insights/leads?limit=101', { headers })).status).toBe(
      422,
    );
    expect(
      (
        await app.request('/api/admin/insights/leads/11111111-1111-4111-8111-111111111111', {
          headers,
        })
      ).status,
    ).toBe(404);
    const report = await app.request(`/api/admin/insights/report?from=${from}&to=${to}`, {
      headers,
    });
    expect(adminReportResponseSchema.parse(await report.json()).metrics).toMatchObject({
      enquiries: 0,
      responseRate: 0,
      conversionRate: 0,
    });
    const company = await makeOrganization({ name: 'Literal \\_% Studio' });
    await makeOrganization({ name: 'Literal XXX Studio' });
    const lookup = await app.request(
      `/api/admin/insights/companies?q=${encodeURIComponent('\\_%')}&limit=1`,
      { headers },
    );
    expect(await lookup.json()).toMatchObject({ total: 1, items: [{ id: company.id }] });
  });
});
