import { db, lt, schema } from '@repo/db';

export const SEARCH_ACTIVITY_RETENTION_DAYS = 180;

export async function purgeExpiredSearchActivity(
  now: Date = new Date(),
  retentionDays: number = SEARCH_ACTIVITY_RETENTION_DAYS,
): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(schema.searchActivity)
    .where(lt(schema.searchActivity.createdAt, cutoff))
    .returning({ id: schema.searchActivity.id });
  return deleted.length;
}
