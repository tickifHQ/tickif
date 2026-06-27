import { describe, expect, it } from 'vitest';
import {
  createLeadSchema,
  leadListStatus,
  leadStatus,
  listLeadsQuerySchema,
  updateLeadSchema,
} from '../src/leads.js';

describe('lead contracts', () => {
  it('keeps persisted status separate from list buckets', () => {
    expect(leadStatus.parse('new')).toBe('new');
    expect(leadListStatus.parse('all')).toBe('all');
    expect(leadStatus.safeParse('all').success).toBe(false);
  });

  it('defaults lead list query pagination', () => {
    expect(listLeadsQuerySchema.parse({})).toMatchObject({
      status: 'all',
      page: 1,
      limit: 12,
    });
  });

  it('coerces pagination and accepts filters', () => {
    expect(
      listLeadsQuerySchema.parse({
        status: 'contacted',
        q: 'bandra',
        page: '2',
        limit: '24',
      }),
    ).toMatchObject({
      status: 'contacted',
      q: 'bandra',
      page: 2,
      limit: 24,
    });
  });

  it('accepts minimal internal create payloads', () => {
    expect(
      createLeadSchema.safeParse({
        name: 'Priya Shah',
        contactNumber: '+919800000001',
      }).success,
    ).toBe(true);
  });

  it('validates status updates', () => {
    expect(updateLeadSchema.safeParse({ status: 'spam' }).success).toBe(true);
    expect(updateLeadSchema.safeParse({ status: 'pending' }).success).toBe(false);
  });
});
