import { describe, expect, it } from 'vitest';
import { enquiryCountsSchema } from '../src/enquiries';

describe('enquiry counts', () => {
  it('accepts zero and bounded integer counts', () => {
    expect(enquiryCountsSchema.safeParse({ total: 0, unread: 0 }).success).toBe(true);
    expect(enquiryCountsSchema.safeParse({ total: 30, unread: 12 }).success).toBe(true);
  });
  it.each([
    { total: 0, unread: 1 },
    { total: 1, unread: -1 },
    { total: 2, unread: 0.5 },
    { total: 2 },
    { total: '2', unread: 1 },
  ])('rejects malformed or impossible counts: %j', (value) => {
    expect(enquiryCountsSchema.safeParse(value).success).toBe(false);
  });
});
