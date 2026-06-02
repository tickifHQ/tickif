import { db, schema, eq, and, desc, sql } from '@repo/db';
import type { CreateProjectInput, ProjectStatus } from '@repo/contracts';

/**
 * Data-access for projects. This is the ONLY layer that imports Drizzle.
 * It exposes a framework-free record type and typed methods over the schema.
 */
export type ProjectRecord = typeof schema.project.$inferSelect;

export type ListProjectsParams = {
  status?: ProjectStatus;
  citySlug?: string;
  limit: number;
  offset: number;
};

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'project'
  );
}

export const projectsRepository = {
  async list(params: ListProjectsParams): Promise<{ items: ProjectRecord[]; total: number }> {
    const filters = [
      params.status ? eq(schema.project.status, params.status) : undefined,
      params.citySlug ? eq(schema.project.citySlug, params.citySlug) : undefined,
    ].filter((f) => f !== undefined);

    const where = filters.length ? and(...filters) : undefined;

    const [items, [count]] = await Promise.all([
      db
        .select()
        .from(schema.project)
        .where(where)
        .orderBy(desc(schema.project.createdAt))
        .limit(params.limit)
        .offset(params.offset),
      db.select({ value: sql<number>`count(*)::int` }).from(schema.project).where(where),
    ]);

    return { items, total: count?.value ?? 0 };
  },

  async findById(id: string): Promise<ProjectRecord | null> {
    const [row] = await db.select().from(schema.project).where(eq(schema.project.id, id)).limit(1);
    return row ?? null;
  },

  async findBySlug(slug: string): Promise<ProjectRecord | null> {
    const [row] = await db
      .select()
      .from(schema.project)
      .where(eq(schema.project.slug, slug))
      .limit(1);
    return row ?? null;
  },

  async create(input: CreateProjectInput, slug: string): Promise<ProjectRecord> {
    const [row] = await db
      .insert(schema.project)
      .values({
        designerId: input.designerId,
        title: input.title,
        slug,
        description: input.description ?? null,
        citySlug: input.citySlug ?? null,
        budgetBandSlug: input.budgetBandSlug ?? null,
        metadata: input.metadata ?? {},
      })
      .returning();
    if (!row) throw new Error('insert returned no row');
    return row;
  },

  slugify,
};
