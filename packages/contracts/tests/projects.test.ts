import { describe, it, expect } from 'vitest';
import { createProjectSchema, listProjectsQuerySchema } from '../src/projects.js';

// A valid RFC-4122 UUID (version + variant nibbles correct).
const VALID_UUID = '11111111-1111-4111-8111-111111111111';

describe('createProjectSchema', () => {
  it('accepts a valid payload', () => {
    const result = createProjectSchema.safeParse({
      designerId: VALID_UUID,
      title: 'Sunlit Bandra Apartment',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a too-short title', () => {
    const result = createProjectSchema.safeParse({
      designerId: '22222222-2222-2222-2222-222222222222',
      title: 'x',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid designerId', () => {
    const result = createProjectSchema.safeParse({ designerId: 'nope', title: 'Valid Title' });
    expect(result.success).toBe(false);
  });
});

describe('listProjectsQuerySchema', () => {
  it('applies defaults and coerces string pagination', () => {
    const parsed = listProjectsQuerySchema.parse({ limit: '10', offset: '5' });
    expect(parsed).toMatchObject({ limit: 10, offset: 5 });
  });

  it('defaults limit/offset when absent', () => {
    const parsed = listProjectsQuerySchema.parse({});
    expect(parsed).toMatchObject({ limit: 20, offset: 0 });
  });
});
