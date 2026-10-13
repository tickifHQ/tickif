import { describe, expect, it } from 'vitest';
import { parseFeedParams } from '@/lib/feed-params';
import { enquiryActivityAge, visitorFeedSummary, visitorNearYouHref } from '@/lib/visitor-home';

describe('visitor home presentation', () => {
  it('describes message ages at minute, hour and day boundaries without negative ages', () => {
    const now = Date.parse('2026-10-13T10:00:00Z');
    const ago = (minutes: number) => new Date(now - minutes * 60000).toISOString();
    expect(enquiryActivityAge(ago(-1), now)).toBe('just now');
    expect(enquiryActivityAge(ago(0), now)).toBe('just now');
    expect(enquiryActivityAge(ago(59), now)).toBe('59m ago');
    expect(enquiryActivityAge(ago(60), now)).toBe('1h ago');
    expect(enquiryActivityAge(ago(1439), now)).toBe('23h ago');
    expect(enquiryActivityAge(ago(1440), now)).toBe('1d ago');
  });

  it('summarizes only the filters actually applied, with real taxonomy labels', () => {
    expect(
      visitorFeedSummary(
        parseFeedParams({
          bhk: '3-bhk',
          city: 'chennai',
          locality: 'adyar',
          budgetBand: '5l-10l',
          theme: 'minimalist',
        }),
        {
          bhk: [{ slug: '3-bhk', label: '3 BHK' }],
          city: [{ slug: 'chennai', label: 'Chennai' }],
          locality: [{ slug: 'adyar', label: 'Adyar' }],
          budgetBand: [{ slug: '5l-10l', label: '₹5L - ₹10L' }],
          theme: [{ slug: 'minimalist', label: 'Minimalist' }],
        },
      ),
    ).toEqual(['3 BHK', 'Adyar, Chennai', '₹5L - ₹10L', 'Minimalist']);
  });

  it('does not invent home, budget or style preferences after clearing the feed', () => {
    expect(visitorFeedSummary(parseFeedParams({}), {})).toEqual([]);
  });

  it('uses a readable fallback for stale taxonomy values', () => {
    expect(visitorFeedSummary(parseFeedParams({ city: 'new-city' }), {})).toEqual(['New City']);
  });

  it('offers Near you only with a saved location and never adds a guessed city', () => {
    expect(visitorNearYouHref({})).toBeNull();
    expect(
      visitorNearYouHref({ bhkSlug: '3-bhk', citySlug: 'chennai', localitySlug: 'adyar' }),
    ).toBe('/home?feed=custom&city=chennai&locality=adyar&view=nearby');
  });
});
