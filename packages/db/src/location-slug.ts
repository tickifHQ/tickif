import { createHash } from 'node:crypto';

/** Stable database identity shared by new locations and legacy project classification. */
export function locationSlug(label: string): string {
  const normalized = label.normalize('NFKD').toLowerCase();
  const slug = normalized
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const digest = createHash('sha256').update(normalized).digest('hex').slice(0, 20);
  if (!slug) return `location-${digest}`;
  return slug.length <= 80 ? slug : `${slug.slice(0, 59).replace(/-+$/, '')}-${digest}`;
}
