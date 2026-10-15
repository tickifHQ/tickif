import { describe, expect, it } from 'vitest';
import { latestEnquiryReadWatermark } from '@/lib/enquiry-read-watermark';

describe('enquiry read watermark', () => {
  it('retains the latest loaded microsecond without inventing a later read time', () => {
    expect(
      latestEnquiryReadWatermark([
        '2026-10-01T00:00:00.123Z',
        '2026-10-01T00:00:00.123456Z',
        '2026-10-01T00:00:00.123457Z',
      ]),
    ).toBe('2026-10-01T00:00:00.123457Z');
  });
  it('normalizes old millisecond and whole-second responses without rounding up', () => {
    expect(
      latestEnquiryReadWatermark(['2026-10-01T00:00:01Z', '2026-10-01T00:00:00.999999Z']),
    ).toBe('2026-10-01T00:00:01.000000Z');
  });
  it('does not acknowledge unknown activity as the current time or epoch', () => {
    expect(latestEnquiryReadWatermark([null, undefined, '', 'invalid'])).toBeUndefined();
  });
});
