import { describe, expect, it } from 'vitest';
import {
  savedProjectParamSchema,
  savedProjectsStateQuerySchema,
  savedProjectsStateResponseSchema,
  listSavedProjectsQuerySchema,
  listSavedProjectsResponseSchema,
} from '../src/saved-projects.js';

const projectId = '11111111-1111-4111-8111-111111111111';

describe('saved project contracts', () => {
  it('coerces defaults and bounds saved-list pagination', () => {
    expect(listSavedProjectsQuerySchema.parse({})).toEqual({ page: 1, limit: 12 });
    expect(listSavedProjectsQuerySchema.parse({ page: '2', limit: '48' })).toEqual({
      page: 2,
      limit: 48,
    });
    for (const query of [
      { page: 0 },
      { page: 100001 },
      { page: 1.5 },
      { limit: 0 },
      { limit: 49 },
      { page: 'NaN' },
    ]) {
      expect(listSavedProjectsQuerySchema.safeParse(query).success).toBe(false);
    }
  });

  it('allows zero visible saves without negative or invalid counts', () => {
    const empty = { projects: [], page: 1, limit: 12, total: 0, totalPages: 0 };
    expect(listSavedProjectsResponseSchema.safeParse(empty).success).toBe(true);
    expect(listSavedProjectsResponseSchema.safeParse({ ...empty, total: -1 }).success).toBe(false);
    expect(
      listSavedProjectsResponseSchema.safeParse({ ...empty, projects: [{ id: projectId }] })
        .success,
    ).toBe(false);
  });
  it('accepts one project id or a bounded batch', () => {
    expect(savedProjectsStateQuerySchema.safeParse({ projectIds: projectId }).success).toBe(true);
    expect(
      savedProjectsStateQuerySchema.safeParse({ projectIds: [projectId, projectId] }).success,
    ).toBe(true);
    expect(
      savedProjectsStateQuerySchema.safeParse({ projectIds: Array(49).fill(projectId) }).success,
    ).toBe(false);
  });

  it('rejects invalid project identifiers', () => {
    expect(savedProjectParamSchema.safeParse({ projectId: 'not-a-uuid' }).success).toBe(false);
    expect(savedProjectsStateQuerySchema.safeParse({ projectIds: [] }).success).toBe(false);
  });

  it('validates the saved-state response', () => {
    expect(
      savedProjectsStateResponseSchema.safeParse({ savedProjectIds: [projectId] }).success,
    ).toBe(true);
  });
});
