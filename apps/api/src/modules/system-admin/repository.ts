import { db, schema } from '@repo/db';
import { sql } from 'drizzle-orm';

export const systemAdminRepository = {
  async seed(email: string): Promise<void> {
    await db.transaction(async (tx) => {
      // Serialize replicas, including the case-insensitive identity check.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended('tickif-superadmin-bootstrap', 0))`,
      );
      const existing = await tx
        .select({ id: schema.user.id })
        .from(schema.user)
        .where(sql`lower(${schema.user.email}) = ${email}`);
      // Provision only once. Restarts must never undo bans, demotions, or verification.
      if (existing.length > 0) return;
      await tx
        .insert(schema.user)
        .values({
          id: crypto.randomUUID(),
          name: 'Tickif System Admin',
          email,
          emailVerified: false,
          role: 'superadmin',
          status: 'active',
        })
        .onConflictDoNothing({ target: schema.user.email });
    });
  },
};
