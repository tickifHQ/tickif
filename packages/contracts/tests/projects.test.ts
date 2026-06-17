import { describe, it, expect } from 'vitest';
import {
  createProjectRoomSchema,
  createProjectSchema,
  listProjectsQuerySchema,
  projectRoomSchema,
} from '../src/projects.js';

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

describe('project room contracts', () => {
  it('accepts a create payload with provisional room labels', () => {
    const result = createProjectRoomSchema.safeParse({
      roomTypeId: VALID_UUID,
      name: 'Living Room',
      sortOrder: 0,
      metadata: {
        labels: ['airy', 'wood tones'],
        attributeLabels: { finish: ['veneer'] },
      },
    });

    expect(result.success).toBe(true);
  });

  it('rejects empty label entries', () => {
    const result = createProjectRoomSchema.safeParse({
      roomTypeId: VALID_UUID,
      name: 'Living Room',
      metadata: { labels: [''] },
    });

    expect(result.success).toBe(false);
  });

  it('bounds provisional attribute label keys and entry count', () => {
    const longKey = 'x'.repeat(81);
    const tooManyKeys = Object.fromEntries(
      Array.from({ length: 21 }, (_, i) => [`finish-${i}`, ['veneer']]),
    );

    expect(
      createProjectRoomSchema.safeParse({
        roomTypeId: VALID_UUID,
        name: 'Living Room',
        metadata: { attributeLabels: { [longKey]: ['veneer'] } },
      }).success,
    ).toBe(false);
    expect(
      createProjectRoomSchema.safeParse({
        roomTypeId: VALID_UUID,
        name: 'Living Room',
        metadata: { attributeLabels: tooManyKeys },
      }).success,
    ).toBe(false);
  });

  it('serializes project room responses with timestamps', () => {
    const result = projectRoomSchema.safeParse({
      id: VALID_UUID,
      projectId: '22222222-2222-4222-8222-222222222222',
      roomTypeId: '33333333-3333-4333-8333-333333333333',
      name: 'Kitchen',
      description: null,
      sortOrder: 1,
      metadata: { labels: [''], attributeLabels: { ['x'.repeat(90)]: Array(25).fill('veneer') } },
      createdAt: '2026-06-15T00:00:00.000Z',
      updatedAt: '2026-06-15T00:00:00.000Z',
    });

    expect(result.success).toBe(true);
  });
});
