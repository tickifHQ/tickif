import { describe, expect, it } from 'vitest';
import { createProjectReportSchema, projectReportResponseSchema } from '../src/content-reports.js';

describe('project report contracts', () => {
  it('accepts a bounded report reason and details', () => {
    expect(
      createProjectReportSchema.parse({
        reason: 'misleading',
        details: 'The project description does not match its photos.',
      }),
    ).toEqual({
      reason: 'misleading',
      details: 'The project description does not match its photos.',
    });
  });

  it('requires details for the other reason', () => {
    expect(createProjectReportSchema.safeParse({ reason: 'other' }).success).toBe(false);
  });

  it('accepts the idempotent report response', () => {
    expect(
      projectReportResponseSchema.parse({
        projectId: '11111111-1111-4111-8111-111111111111',
        reported: true,
      }),
    ).toEqual({
      projectId: '11111111-1111-4111-8111-111111111111',
      reported: true,
    });
  });
});
