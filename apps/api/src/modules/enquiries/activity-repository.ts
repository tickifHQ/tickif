import { and, db, desc, eq, schema, sql } from '@repo/db';
import type { SendEnquiryMessage } from '@repo/contracts';

export const enquiryActivityRepository = {
  async viewed(leadId: string, organizationId: string) {
    const result = await db
      .update(schema.enquiry)
      .set({ viewedAt: sql`coalesce(${schema.enquiry.viewedAt}, now())` })
      .where(
        and(eq(schema.enquiry.leadId, leadId), eq(schema.enquiry.organizationId, organizationId)),
      )
      .returning({ id: schema.enquiry.id });
    return result.length > 0;
  },
  async byLead(leadId: string) {
    const [row] = await db
      .select({ id: schema.enquiry.id, status: schema.enquiry.status })
      .from(schema.enquiry)
      .where(eq(schema.enquiry.leadId, leadId))
      .limit(1);
    return row ?? null;
  },
  async messages(enquiryId: string, limit: number, offset: number) {
    return db
      .select({
        id: schema.enquiryMessage.id,
        body: schema.enquiryMessage.body,
        createdAt: schema.enquiryMessage.createdAt,
        readThrough: sql<string>`to_char(${schema.enquiryMessage.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      })
      .from(schema.enquiryMessage)
      .where(eq(schema.enquiryMessage.enquiryId, enquiryId))
      .orderBy(desc(schema.enquiryMessage.createdAt), desc(schema.enquiryMessage.id))
      .limit(limit)
      .offset(offset);
  },
  async send(leadId: string, organizationId: string, authorId: string, input: SendEnquiryMessage) {
    return db.transaction(async (tx) => {
      const [lead] = await tx
        .select({ status: schema.lead.status })
        .from(schema.lead)
        .where(and(eq(schema.lead.id, leadId), eq(schema.lead.organizationId, organizationId)))
        .for('update')
        .limit(1);
      if (!lead) return { kind: 'missing' } as const;
      const [enquiry] = await tx
        .select({ id: schema.enquiry.id, status: schema.enquiry.status })
        .from(schema.enquiry)
        .where(
          and(eq(schema.enquiry.leadId, leadId), eq(schema.enquiry.organizationId, organizationId)),
        )
        .for('update')
        .limit(1);
      if (!enquiry) return { kind: 'missing' } as const;
      // Return a successful prior send even if the enquiry closed during a transport retry.
      const [prior] = await tx
        .select({
          id: schema.enquiryMessage.id,
          body: schema.enquiryMessage.body,
          createdAt: schema.enquiryMessage.createdAt,
          readThrough: sql<string>`to_char(${schema.enquiryMessage.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
        })
        .from(schema.enquiryMessage)
        .where(
          and(
            eq(schema.enquiryMessage.enquiryId, enquiry.id),
            eq(schema.enquiryMessage.requestId, input.requestId),
          ),
        )
        .limit(1);
      if (prior)
        return prior.body === input.body
          ? ({ kind: 'sent', message: prior } as const)
          : ({ kind: 'conflict' } as const);
      if (enquiry.status === 'closed' || lead.status === 'closed' || lead.status === 'spam')
        return { kind: 'closed' } as const;
      const [message] = await tx
        .insert(schema.enquiryMessage)
        .values({
          enquiryId: enquiry.id,
          authorId,
          ...input,
          // Transaction now() predates any lead-lock wait. Timestamp the actual
          // insert so a reply cannot fall behind activity read while it waited.
          createdAt: sql`clock_timestamp()`,
        })
        .returning({
          id: schema.enquiryMessage.id,
          body: schema.enquiryMessage.body,
          createdAt: schema.enquiryMessage.createdAt,
          readThrough: sql<string>`to_char(${schema.enquiryMessage.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
        });
      if (!message) throw new Error('Message insert returned no row');
      await tx
        .update(schema.enquiry)
        .set({
          viewedAt: sql`coalesce(${schema.enquiry.viewedAt}, ${message.readThrough}::timestamptz)`,
          contactedAt: sql`coalesce(${schema.enquiry.contactedAt}, ${message.readThrough}::timestamptz)`,
          lastMessageAt: sql`${message.readThrough}::timestamptz`,
          status: 'responded',
          updatedAt: new Date(),
        })
        .where(eq(schema.enquiry.id, enquiry.id));
      return { kind: 'sent', message } as const;
    });
  },
  async read(enquiryId: string, requesterId: string, through: string) {
    const rows = await db
      .update(schema.enquiry)
      .set({
        activityReadAt: sql`greatest(coalesce(${schema.enquiry.activityReadAt}, '-infinity'::timestamptz), least(${through}::timestamptz, now()))`,
      })
      .where(and(eq(schema.enquiry.id, enquiryId), eq(schema.enquiry.requesterId, requesterId)))
      .returning({ id: schema.enquiry.id });
    return rows.length > 0;
  },
};
