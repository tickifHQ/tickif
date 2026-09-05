import { db, sql } from '@repo/db';

/** Deployment readiness must establish an authenticated DB connection. */
export async function probeDatabase(): Promise<void> {
  await db.execute(sql`select 1`);
}
