import { createLocationSchema } from '@repo/contracts';
import {
  db,
  schema,
  eq,
  and,
  or,
  isNull,
  sql,
  asc,
  gt,
  ne,
  SEARCH_PROJECTION_ADVISORY_LOCK_KEY,
  type DbTransaction,
} from '../index.js';
import { locationSlug } from '../location-slug.js';

const batchSize = 250;

async function resolveCity(tx: DbTransaction, label: string) {
  const input = createLocationSchema.safeParse({ cityLabel: label });
  if (!input.success || !input.data.cityLabel) return null;
  const slug = locationSlug(input.data.cityLabel);
  await tx
    .insert(schema.taxonomy)
    .values({ kind: 'city', label: input.data.cityLabel, slug })
    .onConflictDoNothing();
  const [city] = await tx
    .select({ slug: schema.taxonomy.slug })
    .from(schema.taxonomy)
    .where(
      and(
        eq(schema.taxonomy.kind, 'city'),
        eq(schema.taxonomy.slug, slug),
        eq(schema.taxonomy.isActive, true),
      ),
    );
  return city?.slug ?? null;
}

/**
 * Classify saved custom cities without rewriting names or publishing pending
 * content. Resolve each version's own label under the canonical approval lock.
 */
export async function seedProjectLocations() {
  const result = { projects: 0, pendingVersions: 0, skipped: 0 };
  let cursor: string | undefined;
  for (;;) {
    const rows = await db
      .select({ id: schema.project.id })
      .from(schema.project)
      .where(
        and(
          ne(schema.project.status, 'deleted'),
          or(
            and(isNull(schema.project.citySlug), sql`${schema.project.cityName} is not null`),
            sql`exists (select 1 from ${schema.projectPendingVersion}
          where ${schema.projectPendingVersion.projectId} = ${schema.project.id}
          and ${schema.projectPendingVersion.content}->'project'->>'citySlug' is null
          and ${schema.projectPendingVersion.content}->'project'->>'cityName' is not null)`,
          ),
          ...(cursor ? [gt(schema.project.id, cursor)] : []),
        ),
      )
      .orderBy(asc(schema.project.id))
      .limit(batchSize);
    if (rows.length === 0) break;
    for (const row of rows) {
      const classified = await db.transaction(async (tx) => {
        const count = { projects: 0, pendingVersions: 0, skipped: 0 };
        // Approval, autosave and other version mutations lock the live row first.
        const [project] = await tx
          .select()
          .from(schema.project)
          .where(and(eq(schema.project.id, row.id), ne(schema.project.status, 'deleted')))
          .for('update');
        if (!project) return count;
        const [pending] = await tx
          .select()
          .from(schema.projectPendingVersion)
          .where(eq(schema.projectPendingVersion.projectId, row.id));

        if (!project.citySlug && project.cityName) {
          const slug = await resolveCity(tx, project.cityName);
          if (!slug) count.skipped++;
          else {
            await tx
              .update(schema.project)
              .set({ citySlug: slug })
              .where(eq(schema.project.id, row.id));
            await tx.execute(
              sql`select pg_advisory_xact_lock_shared(${SEARCH_PROJECTION_ADVISORY_LOCK_KEY})`,
            );
            await tx.insert(schema.searchProjectionOutbox).values({
              entityKind: 'project',
              entityId: project.id,
              operation: 'index',
              sourceUpdatedAt: project.updatedAt,
            });
            count.projects++;
          }
        }

        const pendingProject = pending?.content.project;
        if (pendingProject && !pendingProject.citySlug && pendingProject.cityName) {
          const slug = await resolveCity(tx, pendingProject.cityName);
          if (!slug) count.skipped++;
          else {
            await tx
              .update(schema.projectPendingVersion)
              .set({
                content: sql`jsonb_set(${schema.projectPendingVersion.content}, '{project,citySlug}', to_jsonb(${slug}::text))`,
              })
              .where(eq(schema.projectPendingVersion.projectId, row.id));
            count.pendingVersions++;
          }
        }
        return count;
      });
      result.projects += classified.projects;
      result.pendingVersions += classified.pendingVersions;
      result.skipped += classified.skipped;
    }
    cursor = rows.at(-1)!.id;
  }
  console.log(
    `[seed] Legacy project locations: ${result.projects} projects, ${result.pendingVersions} pending versions classified; ${result.skipped} invalid/inactive names preserved.`,
  );
  return result;
}
