import { describe, expect, it } from 'vitest';
import {
  savedProjectParamSchema,
  savedProjectsStateQuerySchema,
  savedProjectsStateResponseSchema,
} from '../src/saved-projects.js';

const projectId = '11111111-1111-4111-8111-111111111111';

describe('saved project contracts', () => {
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
    expect(savedProjectsStateResponseSchema.safeParse({ savedProjectIds: [projectId] }).success)
      .toBe(true);
  });
});
