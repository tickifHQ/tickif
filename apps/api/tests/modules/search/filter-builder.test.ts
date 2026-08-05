import { describe, it, expect } from 'vitest';
import {
  escapeFilterValue,
  buildProjectFilter,
  buildDesignerFilter,
} from '../../../src/modules/search/filter-builder.js';

describe('escapeFilterValue', () => {
  it('returns unchanged value when no special characters present', () => {
    expect(escapeFilterValue('mumbai')).toBe('mumbai');
    expect(escapeFilterValue('3-bhk')).toBe('3-bhk');
    expect(escapeFilterValue('modern-minimalist')).toBe('modern-minimalist');
  });

  it('escapes backslashes', () => {
    expect(escapeFilterValue('path\\to\\value')).toBe('path\\\\to\\\\value');
    expect(escapeFilterValue('\\')).toBe('\\\\');
  });

  it('escapes backticks', () => {
    expect(escapeFilterValue('value`with`backticks')).toBe('value\\`with\\`backticks');
    expect(escapeFilterValue('`')).toBe('\\`');
  });

  it('escapes both backslashes and backticks in correct order', () => {
    // Backslash followed by backtick should become \\ followed by \`
    expect(escapeFilterValue('\\`')).toBe('\\\\\\`');
    // Backtick followed by backslash
    expect(escapeFilterValue('`\\')).toBe('\\`\\\\');
    // Complex mixed case
    expect(escapeFilterValue('a\\b`c\\d`e')).toBe('a\\\\b\\`c\\\\d\\`e');
  });

  it('handles empty string', () => {
    expect(escapeFilterValue('')).toBe('');
  });
});

describe('buildProjectFilter', () => {
  it('returns empty string when no filters provided', () => {
    expect(buildProjectFilter({})).toBe('');
  });

  it('builds single value filter with correct syntax', () => {
    expect(buildProjectFilter({ citySlug: 'mumbai' })).toBe('citySlug:=`mumbai`');
    expect(buildProjectFilter({ bhkSlug: '3-bhk' })).toBe('bhkSlug:=`3-bhk`');
  });

  it('builds array filter with OR syntax', () => {
    expect(buildProjectFilter({ citySlug: ['mumbai', 'pune'] })).toBe(
      'citySlug:=[`mumbai`, `pune`]'
    );
  });

  it('applies AND logic between different facets', () => {
    const result = buildProjectFilter({
      citySlug: 'mumbai',
      bhkSlug: '3-bhk',
    });
    // Keys should be sorted alphabetically
    expect(result).toBe('bhkSlug:=`3-bhk` && citySlug:=`mumbai`');
  });

  it('combines OR within facet and AND between facets', () => {
    const result = buildProjectFilter({
      citySlug: ['mumbai', 'pune'],
      bhkSlug: '3-bhk',
      themes: ['modern', 'minimalist'],
    });
    expect(result).toBe(
      'bhkSlug:=`3-bhk` && citySlug:=[`mumbai`, `pune`] && themes:=[`modern`, `minimalist`]'
    );
  });

  it('silently strips unknown filter keys', () => {
    const result = buildProjectFilter({
      citySlug: 'mumbai',
      unknownField: 'should-be-ignored',
      anotherUnknown: ['also', 'ignored'],
    });
    expect(result).toBe('citySlug:=`mumbai`');
  });

  it('escapes special characters in filter values', () => {
    expect(buildProjectFilter({ citySlug: 'city`name' })).toBe('citySlug:=`city\\`name`');
    expect(buildProjectFilter({ citySlug: 'city\\name' })).toBe('citySlug:=`city\\\\name`');
  });

  it('skips empty string values', () => {
    expect(buildProjectFilter({ citySlug: '' })).toBe('');
    expect(buildProjectFilter({ citySlug: [''] })).toBe('');
    expect(buildProjectFilter({ citySlug: ['', 'mumbai'] })).toBe('citySlug:=`mumbai`');
  });

  it('skips undefined values', () => {
    expect(buildProjectFilter({ citySlug: undefined })).toBe('');
  });

  it('trims whitespace from values', () => {
    expect(buildProjectFilter({ citySlug: ' mumbai ' })).toBe('citySlug:=`mumbai`');
    expect(buildProjectFilter({ citySlug: '  ' })).toBe('');
    expect(buildProjectFilter({ citySlug: [' mumbai ', ' pune '] })).toBe(
      'citySlug:=[`mumbai`, `pune`]'
    );
  });

  it('preserves internal whitespace in values', () => {
    expect(buildProjectFilter({ citySlug: 'new york' })).toBe('citySlug:=`new york`');
    expect(buildProjectFilter({ themes: 'modern minimalist' })).toBe(
      'themes:=`modern minimalist`'
    );
  });

  it('deduplicates values while preserving first occurrence order', () => {
    expect(buildProjectFilter({ themes: ['modern', 'modern', 'minimal'] })).toBe(
      'themes:=[`modern`, `minimal`]'
    );
    expect(buildProjectFilter({ themes: ['a', 'b', 'a', 'c', 'b'] })).toBe(
      'themes:=[`a`, `b`, `c`]'
    );
  });

  it('handles whitespace-only values in arrays', () => {
    expect(buildProjectFilter({ themes: ['modern', '   ', '', 'minimal'] })).toBe(
      'themes:=[`modern`, `minimal`]'
    );
  });

  it('deduplicates after trimming', () => {
    expect(buildProjectFilter({ themes: ['modern', ' modern ', 'modern'] })).toBe(
      'themes:=`modern`'
    );
  });

  it('preserves stable ordering during deduplication', () => {
    // First occurrence order should be preserved, not sorted
    expect(buildProjectFilter({ themes: ['b', 'a', 'b', 'c', 'a'] })).toBe(
      'themes:=[`b`, `a`, `c`]'
    );
  });

  it('escapes values correctly after trimming', () => {
    // Value with special chars and leading/trailing whitespace
    expect(buildProjectFilter({ themes: ' modern\\`wood ' })).toBe(
      'themes:=`modern\\\\\\`wood`'
    );
    // Array with mixed whitespace and special chars
    expect(buildProjectFilter({ themes: [' value`1 ', ' value\\2 '] })).toBe(
      'themes:=[`value\\`1`, `value\\\\2`]'
    );
  });

  it('produces deterministic output (sorted keys)', () => {
    // Same filters in different order should produce same output
    const result1 = buildProjectFilter({
      themes: 'modern',
      citySlug: 'mumbai',
      bhkSlug: '3-bhk',
    });
    const result2 = buildProjectFilter({
      bhkSlug: '3-bhk',
      citySlug: 'mumbai',
      themes: 'modern',
    });
    expect(result1).toBe(result2);
    expect(result1).toBe('bhkSlug:=`3-bhk` && citySlug:=`mumbai` && themes:=`modern`');
  });

  it('handles all allowed project facet fields', () => {
    const allFilters = {
      citySlug: 'mumbai',
      localitySlug: 'bandra',
      propertyTypeSlug: 'residential',
      propertySubtypeSlug: 'apartment',
      scopeSlug: 'full-home',
      bhkSlug: '3-bhk',
      budgetBandSlug: 'premium',
      themes: 'modern',
      materials: 'wood',
      finishes: 'matte',
      roomSlugs: 'living-room',
    };
    const result = buildProjectFilter(allFilters);
    // All fields should be present
    expect(result).toContain('citySlug:=`mumbai`');
    expect(result).toContain('localitySlug:=`bandra`');
    expect(result).toContain('propertyTypeSlug:=`residential`');
    expect(result).toContain('propertySubtypeSlug:=`apartment`');
    expect(result).toContain('scopeSlug:=`full-home`');
    expect(result).toContain('bhkSlug:=`3-bhk`');
    expect(result).toContain('budgetBandSlug:=`premium`');
    expect(result).toContain('themes:=`modern`');
    expect(result).toContain('materials:=`wood`');
    expect(result).toContain('finishes:=`matte`');
    expect(result).toContain('roomSlugs:=`living-room`');
  });
});

describe('buildDesignerFilter', () => {
  it('returns empty string when no filters provided', () => {
    expect(buildDesignerFilter({})).toBe('');
  });

  it('builds single value filter', () => {
    expect(buildDesignerFilter({ entityType: 'individual' })).toBe('entityType:=`individual`');
  });

  it('builds array filter with OR syntax', () => {
    expect(buildDesignerFilter({ citySlugs: ['mumbai', 'delhi'] })).toBe(
      'citySlugs:=[`mumbai`, `delhi`]'
    );
  });

  it('applies AND logic between different facets', () => {
    const result = buildDesignerFilter({
      entityType: 'company',
      citySlugs: ['mumbai'],
    });
    expect(result).toBe('citySlugs:=`mumbai` && entityType:=`company`');
  });

  it('silently strips unknown filter keys', () => {
    const result = buildDesignerFilter({
      entityType: 'individual',
      unknownField: 'ignored',
      citySlug: 'wrong-key', // This is project filter key, not designer
    });
    expect(result).toBe('entityType:=`individual`');
  });

  it('handles all allowed designer facet fields', () => {
    const allFilters = {
      entityType: 'company',
      citySlugs: 'mumbai',
      localitySlugs: 'bandra',
      scopeSlugs: 'full-home',
      themeSlugs: 'modern',
    };
    const result = buildDesignerFilter(allFilters);
    expect(result).toContain('entityType:=`company`');
    expect(result).toContain('citySlugs:=`mumbai`');
    expect(result).toContain('localitySlugs:=`bandra`');
    expect(result).toContain('scopeSlugs:=`full-home`');
    expect(result).toContain('themeSlugs:=`modern`');
  });

  it('escapes special characters in filter values', () => {
    expect(buildDesignerFilter({ citySlugs: 'city`name' })).toBe('citySlugs:=`city\\`name`');
  });
});

describe('filter builder security', () => {
  it('prevents filter injection via unknown keys', () => {
    // Attempt to inject additional filter conditions through key names
    const maliciousFilters = {
      'citySlug:=`injected` && maliciousField': 'value',
      citySlug: 'mumbai',
    };
    const result = buildProjectFilter(maliciousFilters);
    // Only the valid citySlug should be present
    expect(result).toBe('citySlug:=`mumbai`');
    expect(result).not.toContain('injected');
    expect(result).not.toContain('maliciousField');
  });

  it('prevents filter injection via values', () => {
    // Attempt to inject additional conditions through values
    const result = buildProjectFilter({
      citySlug: 'mumbai` && bhkSlug:=`2-bhk',
    });
    // Value should be escaped, not interpreted as filter syntax
    expect(result).toBe('citySlug:=`mumbai\\` && bhkSlug:=\\`2-bhk`');
    // The injection attempt should be treated as a literal value
    expect(result).not.toContain('bhkSlug:=`2-bhk`');
  });

  it('handles values containing Typesense operators', () => {
    const result = buildProjectFilter({
      themes: 'value && otherField:=injection',
    });
    // Should escape and treat as literal value
    expect(result).toBe('themes:=`value && otherField:=injection`');
  });
});
