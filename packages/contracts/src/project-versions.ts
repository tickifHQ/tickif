import { z } from 'zod';
import type { UpdateProjectInput } from './projects';

/** Compared with the approved baseline, never the preceding autosave. */
export const PROJECT_MATERIAL_IMAGE_CHANGE_PERCENT = 20;
export const PROJECT_MATERIAL_FIELDS = [
  'title',
  'propertyTypeSlug',
  'propertySubtypeSlug',
  'scopeSlug',
  'bhkSlug',
  'sizeSqft',
  'citySlug',
  'localitySlug',
  'buildingName',
  'budgetBandSlug',
  'durationMonths',
] as const satisfies readonly (keyof UpdateProjectInput)[];

export const projectPendingStatusSchema = z
  .enum(['draft', 'submitted', 'in_review', 'changes_requested'])
  .meta({ id: 'ProjectPendingStatus' });
export type ProjectPendingStatus = z.infer<typeof projectPendingStatusSchema>;

export function classifyProjectEdit(
  live: UpdateProjectInput,
  next: UpdateProjectInput,
  liveImageIds: readonly string[],
  nextImageIds: readonly string[],
): 'minor' | 'material' {
  if (PROJECT_MATERIAL_FIELDS.some((field) => (live[field] ?? null) !== (next[field] ?? null))) {
    return 'material';
  }
  if ((live.completedMonth?.slice(0, 4) ?? null) !== (next.completedMonth?.slice(0, 4) ?? null)) {
    return 'material';
  }
  const before = new Set(liveImageIds);
  const after = new Set(nextImageIds);
  const removed = [...before].filter((id) => !after.has(id)).length;
  const added = [...after].filter((id) => !before.has(id)).length;
  if (before.size === 0) return added > 0 ? 'material' : 'minor';
  return removed * 100 > before.size * PROJECT_MATERIAL_IMAGE_CHANGE_PERCENT ||
    added * 100 > before.size * PROJECT_MATERIAL_IMAGE_CHANGE_PERCENT
    ? 'material'
    : 'minor';
}
