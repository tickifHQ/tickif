import { describe, it, expect } from 'vitest';
import { escapeFilterValue, buildDiscoveryFilter } from '../../../src/modules/discovery/filter-builder.js';

describe('escapeFilterValue', () => {
  it('escapes left bracket [', () => {
    expect(escapeFilterValue('value[x')).toBe('value\\[x');
  });

  it('escapes right bracket ]', () => {
    expect(escapeFilterValue('value]x')).toBe('value\\]x');
  });

  it('escapes left parenthesis (', () => {
    expect(escapeFilterValue('value(x')).toBe('value\\(x');
  });

  it('escapes right parenthesis )', () => {
    expect(escapeFilterValue('value)x')).toBe('value\\)x');
  });

  it('escapes colon :', () => {
    expect(escapeFilterValue('value:x')).toBe('value\\:x');
  });

  it('escapes comma ,', () => {
    expect(escapeFilterValue('value,x')).toBe('value\\,x');
  });

  it('escapes double quote "', () => {
    expect(escapeFilterValue('value"x')).toBe('value\\"x');
  });

  it('escapes backslash \\', () => {
    expect(escapeFilterValue('value\\x')).toBe('value\\\\x');
  });

  it('escapes space', () => {
    expect(escapeFilterValue('value x')).toBe('value\\ x');
  });

  it('escapes all special characters in a single string', () => {
    expect(escapeFilterValue('a[b]c(d)e:f,g"h\\i j')).toBe(
      'a\\[b\\]c\\(d\\)e\\:f\\,g\\"h\\\\i\\ j',
    );
  });

  it('returns unchanged string when no special characters present', () => {
    expect(escapeFilterValue('mumbai')).toBe('mumbai');
    expect(escapeFilterValue('3-bhk')).toBe('3-bhk');
  });
});

describe('buildDiscoveryFilter', () => {
  describe('OR logic within single facet', () => {
    it('produces OR syntax for multiple values in citySlug', () => {
      const result = buildDiscoveryFilter({ citySlug: ['mumbai', 'pune'] });
      expect(result).toBe('citySlug:[mumbai,pune]');
    });

    it('produces OR syntax for multiple values in bhkSlug', () => {
      const result = buildDiscoveryFilter({ bhkSlug: ['2-bhk', '3-bhk'] });
      expect(result).toBe('bhkSlug:[2-bhk,3-bhk]');
    });
  });

  describe('AND logic between multiple facets', () => {
    it('joins multiple facets with && operator', () => {
      const result = buildDiscoveryFilter({
        citySlug: 'mumbai',
        bhkSlug: '3-bhk',
      });
      expect(result).toBe('citySlug:[mumbai] && bhkSlug:[3-bhk]');
    });

    it('combines OR within facets and AND between facets', () => {
      const result = buildDiscoveryFilter({
        citySlug: ['mumbai', 'pune'],
        scopeSlug: 'full-home',
        bhkSlug: ['2-bhk', '3-bhk'],
      });
      expect(result).toBe('citySlug:[mumbai,pune] && scopeSlug:[full-home] && bhkSlug:[2-bhk,3-bhk]');
    });
  });

  describe('unknown filter keys', () => {
    it('silently strips unknown filter keys', () => {
      // Cast to unknown to simulate unknown keys being passed
      const filters = {
        citySlug: 'mumbai',
        unknownKey: 'should-be-ignored',
        anotherUnknown: ['also', 'ignored'],
      } as unknown as Parameters<typeof buildDiscoveryFilter>[0];

      const result = buildDiscoveryFilter(filters);
      expect(result).toBe('citySlug:[mumbai]');
      expect(result).not.toContain('unknownKey');
      expect(result).not.toContain('anotherUnknown');
    });

    it('returns empty string when only unknown keys are provided', () => {
      const filters = {
        unknownKey: 'value',
        anotherUnknown: ['a', 'b'],
      } as unknown as Parameters<typeof buildDiscoveryFilter>[0];

      const result = buildDiscoveryFilter(filters);
      expect(result).toBe('');
    });
  });

  describe('empty filters', () => {
    it('returns empty string for empty filters object', () => {
      const result = buildDiscoveryFilter({});
      expect(result).toBe('');
    });

    it('returns empty string when all filter values are undefined', () => {
      const result = buildDiscoveryFilter({
        citySlug: undefined,
        bhkSlug: undefined,
      });
      expect(result).toBe('');
    });

    it('returns empty string when filter value is empty array', () => {
      const result = buildDiscoveryFilter({
        citySlug: [],
      });
      expect(result).toBe('');
    });
  });

  describe('single value handling', () => {
    it('wraps single string value in array syntax', () => {
      const result = buildDiscoveryFilter({ citySlug: 'mumbai' });
      expect(result).toBe('citySlug:[mumbai]');
    });

    it('handles single-element array same as string', () => {
      const result = buildDiscoveryFilter({ citySlug: ['mumbai'] });
      expect(result).toBe('citySlug:[mumbai]');
    });
  });

  describe('all allowed filter fields', () => {
    it('builds filter with all allowed fields in correct order', () => {
      const result = buildDiscoveryFilter({
        citySlug: 'mumbai',
        localitySlug: 'bandra',
        propertyTypeSlug: 'residential',
        propertySubtypeSlug: 'apartment',
        scopeSlug: 'full-home',
        bhkSlug: '3-bhk',
        budgetBandSlug: '20-40-lakh',
      });

      expect(result).toBe(
        'citySlug:[mumbai] && localitySlug:[bandra] && propertyTypeSlug:[residential] && propertySubtypeSlug:[apartment] && scopeSlug:[full-home] && bhkSlug:[3-bhk] && budgetBandSlug:[20-40-lakh]',
      );
    });
  });

  describe('escaping in filter values', () => {
    it('escapes special characters in filter values', () => {
      const result = buildDiscoveryFilter({
        citySlug: 'new delhi',
      });
      expect(result).toBe('citySlug:[new\\ delhi]');
    });

    it('escapes special characters in multiple values', () => {
      const result = buildDiscoveryFilter({
        citySlug: ['new delhi', 'san:francisco'],
      });
      expect(result).toBe('citySlug:[new\\ delhi,san\\:francisco]');
    });
  });
});
