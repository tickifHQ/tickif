/**
 * Filter Builder - Safe filter_by construction for Typesense queries
 *
 * This module provides secure filter construction functions that:
 * - Escape special characters to prevent filter injection
 * - Enforce allow-lists for filter keys (unknown keys are silently stripped)
 * - Apply OR logic within facets, AND logic between facets
 * - Produce deterministic output (sorted keys) for testability
 *
 * Typesense filter syntax:
 * - Single value: fieldName:=`value`
 * - Multiple values (OR): fieldName:=[`value1`, `value2`]
 * - Multiple facets (AND): fieldName1:=`value1` && fieldName2:=[`v1`, `v2`]
 */

import {
  PROJECT_FACET_FIELDS,
  DESIGNER_FACET_FIELDS,
  type ProjectFacetField,
  type DesignerFacetField,
} from './constants.js';

/**
 * Filter value type: can be a single string or array of strings
 */
type FilterValue = string | string[] | undefined;

/**
 * Project filters type - maps facet fields to their filter values
 */
export type ProjectFilters = Partial<Record<ProjectFacetField, FilterValue>> &
  Record<string, FilterValue>;

/**
 * Designer filters type - maps facet fields to their filter values
 */
export type DesignerFilters = Partial<Record<DesignerFacetField, FilterValue>> &
  Record<string, FilterValue>;

/**
 * Set of allowed project facet fields for O(1) lookup
 */
const PROJECT_FACET_SET = new Set<string>(PROJECT_FACET_FIELDS);

/**
 * Set of allowed designer facet fields for O(1) lookup
 */
const DESIGNER_FACET_SET = new Set<string>(DESIGNER_FACET_FIELDS);

/**
 * Escapes special characters in filter values to prevent injection attacks.
 *
 * Typesense uses backticks for string literals in filter expressions.
 * We need to escape:
 * - Backslash: \ → \\
 * - Backtick: ` → \`
 *
 * @param value - The raw filter value to escape
 * @returns The escaped value safe for embedding in Typesense filter expressions
 */
export function escapeFilterValue(value: string): string {
  // First escape backslashes, then escape backticks
  // Order matters: if we escape backticks first, then escape backslashes,
  // we'd double-escape the backslash we just added before the backtick
  return value.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
}

/**
 * Normalizes a filter value to an array of non-empty, unique strings.
 *
 * Normalization pipeline:
 * 1. Trim leading/trailing whitespace (internal whitespace preserved)
 * 2. Filter out empty strings
 * 3. Deduplicate (preserving first occurrence order)
 *
 * @param value - The filter value (string, string[], or undefined)
 * @returns An array of non-empty, unique strings, or empty array if no valid values
 */
function normalizeFilterValue(value: FilterValue): string[] {
  if (value === undefined || value === null) {
    return [];
  }

  let values: string[];

  if (Array.isArray(value)) {
    values = value
      .filter((v): v is string => typeof v === 'string')
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    values = trimmed.length > 0 ? [trimmed] : [];
  } else {
    return [];
  }

  // Deduplicate while preserving first occurrence order
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const v of values) {
    if (!seen.has(v)) {
      seen.add(v);
      unique.push(v);
    }
  }

  return unique;
}

/**
 * Builds a single facet filter expression.
 *
 * @param fieldName - The facet field name
 * @param values - Array of values (already normalized)
 * @returns The filter expression for this facet
 */
function buildFacetExpression(fieldName: string, values: string[]): string {
  if (values.length === 0) {
    return '';
  }

  // Escape all values
  const escapedValues = values.map(escapeFilterValue);

  if (escapedValues.length === 1) {
    // Single value: fieldName:=`value`
    return `${fieldName}:=\`${escapedValues[0]}\``;
  }

  // Multiple values (OR logic): fieldName:=[`value1`, `value2`]
  const valueList = escapedValues.map((v) => `\`${v}\``).join(', ');
  return `${fieldName}:=[${valueList}]`;
}

/**
 * Generic filter builder that constructs a Typesense filter_by expression.
 *
 * @param filters - The filter object with field names as keys
 * @param allowedFields - Set of allowed field names (for allow-list enforcement)
 * @returns The complete filter_by expression (empty string if no valid filters)
 */
function buildFilter(
  filters: Record<string, FilterValue>,
  allowedFields: Set<string>
): string {
  // Get all filter keys, filter to allowed only, sort for deterministic output
  const validKeys = Object.keys(filters)
    .filter((key) => allowedFields.has(key))
    .sort();

  // Build expression for each valid filter
  const expressions: string[] = [];

  for (const key of validKeys) {
    const values = normalizeFilterValue(filters[key]);
    if (values.length > 0) {
      const expression = buildFacetExpression(key, values);
      if (expression) {
        expressions.push(expression);
      }
    }
  }

  // Join with AND logic between facets
  return expressions.join(' && ');
}

/**
 * Builds a Typesense filter_by expression for project search.
 *
 * Security features:
 * - Only accepts filter keys defined in PROJECT_FACET_FIELDS
 * - Unknown keys are silently stripped (no error)
 * - Special characters in values are escaped to prevent injection
 *
 * Filter logic:
 * - Multiple values for same facet: OR logic (e.g., citySlug:=[`mumbai`, `pune`])
 * - Different facets: AND logic (e.g., citySlug:=`mumbai` && bhkSlug:=`3-bhk`)
 *
 * @param filters - Object containing filter field names and their values
 * @returns The filter_by expression string (empty string if no valid filters)
 *
 * @example
 * buildProjectFilter({
 *   citySlug: ['mumbai', 'pune'],
 *   bhkSlug: '3-bhk',
 *   unknownField: 'ignored'
 * })
 * // Returns: 'bhkSlug:=`3-bhk` && citySlug:=[`mumbai`, `pune`]'
 */
export function buildProjectFilter(filters: ProjectFilters): string {
  return buildFilter(filters, PROJECT_FACET_SET);
}

/**
 * Builds a Typesense filter_by expression for designer search.
 *
 * Security features:
 * - Only accepts filter keys defined in DESIGNER_FACET_FIELDS
 * - Unknown keys are silently stripped (no error)
 * - Special characters in values are escaped to prevent injection
 *
 * Filter logic:
 * - Multiple values for same facet: OR logic
 * - Different facets: AND logic
 *
 * @param filters - Object containing filter field names and their values
 * @returns The filter_by expression string (empty string if no valid filters)
 *
 * @example
 * buildDesignerFilter({
 *   entityType: 'individual',
 *   citySlugs: ['mumbai', 'delhi'],
 *   unknownField: 'ignored'
 * })
 * // Returns: 'citySlugs:=[`mumbai`, `delhi`] && entityType:=`individual`'
 */
export function buildDesignerFilter(filters: DesignerFilters): string {
  return buildFilter(filters, DESIGNER_FACET_SET);
}
