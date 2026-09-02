import { describe, expect, it } from 'vitest';
import {
  moderationActionEnum,
  projectArchiveReasonEnum,
  projectStatusEnum,
} from '../src/schema/domain.js';

describe('project lifecycle schema', () => {
  it('appends archive, delist, and delete states without reordering existing values', () => {
    expect(projectStatusEnum.enumValues).toEqual([
      'draft',
      'submitted',
      'in_review',
      'published',
      'rejected',
      'changes_requested',
      'archived',
      'delisted',
      'deleted',
    ]);
  });

  it('appends self-service lifecycle audit actions', () => {
    expect(moderationActionEnum.enumValues.slice(-3)).toEqual(['archive', 'restore', 'delete']);
  });

  it('distinguishes manual archives from organization-retention archives', () => {
    expect(projectArchiveReasonEnum.enumValues).toEqual(['manual', 'organization_retention']);
  });
});
