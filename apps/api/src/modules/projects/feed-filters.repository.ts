import type { DiscoveryFeedQuery } from '@repo/contracts';
import { and, db, eq, inArray, schema, sql } from '@repo/db';
import { exists, type SQL } from 'drizzle-orm';

export type ProjectFeedFilters = Pick<
  DiscoveryFeedQuery,
  | 'citySlug'
  | 'localitySlug'
  | 'propertyTypeSlug'
  | 'propertySubtypeSlug'
  | 'scopeSlug'
  | 'bhkSlug'
  | 'budgetBandSlug'
  | 'roomSlugs'
  | 'themes'
>;

function filterValues(value: string | string[] | undefined): string[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

/** Shared Postgres predicates for both public project-feed repositories. */
export function projectFeedFilterClauses(filters: ProjectFeedFilters = {}): SQL[] {
  const clauses: SQL[] = [];
  const directFilters = [
    [schema.project.citySlug, filterValues(filters.citySlug)],
    [schema.project.localitySlug, filterValues(filters.localitySlug)],
    [schema.project.propertyTypeSlug, filterValues(filters.propertyTypeSlug)],
    [schema.project.propertySubtypeSlug, filterValues(filters.propertySubtypeSlug)],
    [schema.project.scopeSlug, filterValues(filters.scopeSlug)],
    [schema.project.bhkSlug, filterValues(filters.bhkSlug)],
    [schema.project.budgetBandSlug, filterValues(filters.budgetBandSlug)],
  ] as const;

  for (const [column, values] of directFilters) {
    if (values.length > 0) clauses.push(inArray(column, values));
  }

  const rooms = filterValues(filters.roomSlugs);
  if (rooms.length > 0) {
    clauses.push(
      exists(
        db
          .select({ id: schema.projectRoom.id })
          .from(schema.projectRoom)
          .innerJoin(schema.taxonomy, eq(schema.projectRoom.roomTypeId, schema.taxonomy.id))
          .where(
            and(
              eq(schema.projectRoom.projectId, schema.project.id),
              eq(schema.taxonomy.kind, 'room'),
              inArray(schema.taxonomy.slug, rooms),
            ),
          ),
      ),
    );
  }

  const themes = filterValues(filters.themes);
  if (themes.length > 0) {
    const themeParameters = sql.join(
      themes.map((theme) => sql`${theme}`),
      sql`, `,
    );
    clauses.push(
      exists(
        db
          .select({ id: schema.projectImage.id })
          .from(schema.projectImage)
          .where(
            and(
              eq(schema.projectImage.projectId, schema.project.id),
              eq(schema.projectImage.status, 'ready'),
              sql`${schema.projectImage.themeSlugs} ?| ARRAY[${themeParameters}]::text[]`,
            ),
          ),
      ),
    );
  }

  return clauses;
}
