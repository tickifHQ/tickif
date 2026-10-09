import { describe, expect, it } from 'vitest';
import {
  upsertVisitorProfileSchema,
  visitorProfileResponseSchema,
  visitorFeedPreferencesSchema,
  visitorFeedPreferencesResponseSchema,
} from '../src/visitors.js';

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
    expect(
      visitorProfileResponseSchema.safeParse({
        address: null,
        whatsappNumber: null,
        onboardingCompletedAt: null,
        createdAt: '2026-08-09T10:00:00.000Z',
        updatedAt: '2026-08-09T10:00:00.000Z',
      }).success,
    ).toBe(true);
  });
});

describe('visitor feed preferences', () => {
  it.each(['1-bhk', '2-bhk', '3-bhk', '4-plus-bhk', 'villa', null])(
    'accepts the home choice %s',
    (homeType) => {
      expect(
        visitorFeedPreferencesSchema.parse({ homeType, citySlug: null, localitySlug: null }),
      ).toEqual({ homeType, citySlug: null, localitySlug: null });
    },
  );

  it('normalizes taxonomy slugs and requires a city for a locality', () => {
    expect(
      visitorFeedPreferencesSchema.parse({
        homeType: '3-bhk',
        citySlug: ' chennai ',
        localitySlug: ' adyar ',
      }),
    ).toEqual({ homeType: '3-bhk', citySlug: 'chennai', localitySlug: 'adyar' });
    expect(
      visitorFeedPreferencesSchema.safeParse({
        homeType: '3-bhk',
        citySlug: null,
        localitySlug: 'adyar',
      }).success,
    ).toBe(false);
  });

  it.each([
    {},
    { homeType: 'studio', citySlug: null, localitySlug: null },
    { homeType: null, citySlug: 'Chennai, India', localitySlug: null },
    { homeType: null, citySlug: null, localitySlug: null, userId: 'someone-else' },
  ])('rejects incomplete or unrecognized inputs: %j', (input) => {
    expect(visitorFeedPreferencesSchema.safeParse(input).success).toBe(false);
  });

  it('distinguishes no saved answer from an explicit skip', () => {
    expect(
      visitorFeedPreferencesResponseSchema.parse({ preferences: null, filters: {} }).preferences,
    ).toBeNull();
    expect(
      visitorFeedPreferencesResponseSchema.parse({
        preferences: { homeType: null, citySlug: null, localitySlug: null },
        filters: {},
      }).preferences,
    ).not.toBeNull();
  });
});
