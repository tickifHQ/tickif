import { describe, expect, it } from 'vitest';
import { upsertVisitorProfileSchema, visitorProfileResponseSchema } from '../src/visitors.js';

describe('visitor profile contracts', () => {
  it('accepts nullable onboarding fields and normalizes surrounding whitespace', () => {
    expect(
      upsertVisitorProfileSchema.parse({
        address: '  Bandra West, Mumbai  ',
        whatsappNumber: '  +919800000001  ',
      }),
    ).toEqual({
      address: 'Bandra West, Mumbai',
      whatsappNumber: '+919800000001',
    });

    expect(upsertVisitorProfileSchema.parse({ address: null, whatsappNumber: null })).toEqual({
      address: null,
      whatsappNumber: null,
    });
  });

  it('rejects blank or oversized addresses and non-E.164 WhatsApp numbers', () => {
    expect(
      upsertVisitorProfileSchema.safeParse({ address: '   ', whatsappNumber: null }).success,
    ).toBe(false);
    expect(
      upsertVisitorProfileSchema.safeParse({
        address: 'a'.repeat(301),
        whatsappNumber: null,
      }).success,
    ).toBe(false);

    for (const whatsappNumber of [
      '919800000001',
      '+019800000001',
      '+91 98000 00001',
      '+1234567',
      '+1234567890123456',
    ]) {
      expect(upsertVisitorProfileSchema.safeParse({ address: null, whatsappNumber }).success).toBe(
        false,
      );
    }
  });

  it('rejects missing and unknown fields rather than accepting ambiguous writes', () => {
    expect(upsertVisitorProfileSchema.safeParse({ address: null }).success).toBe(false);
    expect(
      upsertVisitorProfileSchema.safeParse({
        address: null,
        whatsappNumber: null,
        phoneNumber: '+919800000001',
      }).success,
    ).toBe(false);
  });

  it('serializes server-owned completion and persistence timestamps', () => {
    expect(
      visitorProfileResponseSchema.safeParse({
        address: 'Bandra West, Mumbai',
        whatsappNumber: '+919800000001',
        onboardingCompletedAt: '2026-08-09T10:00:00.000Z',
        createdAt: '2026-08-09T10:00:00.000Z',
        updatedAt: '2026-08-09T10:00:00.000Z',
      }).success,
    ).toBe(true);
  });
});
