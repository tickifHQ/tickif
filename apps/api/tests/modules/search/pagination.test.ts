import { describe, it, expect } from 'vitest';
import { pageToOffset } from '../../../src/modules/search/pagination.js';

describe('pageToOffset', () => {
  it('converts page 1 to offset 0', () => {
    expect(pageToOffset(1, 24)).toEqual({ offset: 0, limit: 24 });
  });

  it('converts page 2 with limit 24 to offset 24', () => {
    expect(pageToOffset(2, 24)).toEqual({ offset: 24, limit: 24 });
  });

  it('converts page 5 with limit 12 to offset 48', () => {
    expect(pageToOffset(5, 12)).toEqual({ offset: 48, limit: 12 });
  });

  it('handles limit 48 at page 20 (offset 912)', () => {
    expect(pageToOffset(20, 48)).toEqual({ offset: 912, limit: 48 });
  });

  it('preserves the limit value unchanged', () => {
    const result = pageToOffset(3, 30);
    expect(result.limit).toBe(30);
  });
});
