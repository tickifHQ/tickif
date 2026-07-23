import { z } from 'zod';
import { projectStatus } from './projects.js';

export const moderationAction = z
  .enum([
    'submit',
    'resubmit',
    'withdraw',
    'start_review',
    'publish',
    'request_changes',
    'reject',
    'unpublish',
    'metadata_corrected',
  ])
  .meta({ id: 'ModerationAction' });
export type ModerationAction = z.infer<typeof moderationAction>;

export const moderationFieldDiff = z
  .record(
    z.string(),
    z.object({
      from: z.unknown(),
      to: z.unknown(),
    }),
  )
  .meta({ id: 'ModerationFieldDiff' });
export type ModerationFieldDiff = z.infer<typeof moderationFieldDiff>;

export const moderationHistoryItemSchema = z
  .object({
    id: z.uuid(),
    action: moderationAction,
    fromStatus: projectStatus,
    toStatus: projectStatus,
    actorLabel: z.literal('Tickif Review Team'),
    note: z.string().nullable(),
    reasonCode: z.string().nullable(),
    fieldDiff: moderationFieldDiff.nullable(),
    createdAt: z.string().datetime(),
  })
  .meta({ id: 'ModerationHistoryItem' });
export type ModerationHistoryItem = z.infer<typeof moderationHistoryItemSchema>;

export const moderationHistoryResponseSchema = z
  .object({
    items: z.array(moderationHistoryItemSchema),
  })
  .meta({ id: 'ModerationHistory' });
export type ModerationHistoryResponse = z.infer<typeof moderationHistoryResponseSchema>;
