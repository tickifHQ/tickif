import { describe, expect, it } from 'vitest';
import {
  followingIdParamSchema,
  followingQuerySchema,
  followingSeenSchema,
  followingStateSchema,
  sendEnquiryMessageSchema,
} from '../src/index';
describe('following and studio messaging contracts', () => {
  it('bounds pagination and validates UUIDs and timestamps', () => {
    expect(followingQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
    expect(followingQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
    expect(followingQuerySchema.safeParse({ page: 10001 }).success).toBe(false);
    expect(followingIdParamSchema.safeParse({ designerProfileId: 'other' }).success).toBe(false);
    expect(followingSeenSchema.safeParse({ seenThrough: 'yesterday' }).success).toBe(false);
    expect(
      followingStateSchema.safeParse({
        designerProfileId: '11111111-1111-4111-8111-111111111111',
        following: 'true',
      }).success,
    ).toBe(false);
  });
  it('requires a nonempty bounded message and an idempotency UUID', () => {
    const requestId = '11111111-1111-4111-8111-111111111111';
    expect(sendEnquiryMessageSchema.parse({ body: ' Hello ', requestId }).body).toBe('Hello');
    expect(sendEnquiryMessageSchema.safeParse({ body: ' ', requestId }).success).toBe(false);
    expect(sendEnquiryMessageSchema.safeParse({ body: 'a'.repeat(2001), requestId }).success).toBe(
      false,
    );
  });
});
