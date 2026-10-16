import { describe, expect, it } from 'vitest';
import {
  adminEntityQuerySchema,
  adminLeadQuerySchema,
  adminReportQuerySchema,
  adminReportWindow,
} from '../src/admin-visibility';

describe('admin visibility filters', () => {
  it('requires paired real dates, ordered within a bounded reporting window', () => {
    for (const value of [
      { from: '2026-02-30', to: '2026-03-01' },
      { from: '2026-10-10' },
      { from: '2026-10-11', to: '2026-10-10' },
      { from: '2025-01-01', to: '2026-01-02' },
    ])
      expect(adminReportQuerySchema.safeParse(value).success).toBe(false);
    expect(adminReportQuerySchema.safeParse({ from: '2026-10-10', to: '2026-10-10' }).success).toBe(
      true,
    );
  });
  it('bounds paging, validates designer ids, and rejects unknown stages', () => {
    for (const value of [
      { page: 0 },
      { page: 10001 },
      { limit: 101 },
      { status: 'won' },
      { designerId: 'bad' },
    ])
      expect(adminLeadQuerySchema.safeParse(value).success).toBe(false);
    expect(adminEntityQuerySchema.safeParse({ groupBy: 'visitor' }).success).toBe(false);
  });
  it('defaults to the last 30 calendar days in India, including today', () => {
    expect(adminReportWindow({}, new Date('2026-10-10T19:00:00Z'))).toEqual({
      from: '2026-09-12',
      to: '2026-10-11',
    });
  });
});
