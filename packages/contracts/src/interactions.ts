import { z } from 'zod';

export const INTERACTION_EVENT_TYPE = {
  PROJECT_VIEW: 'project_view',
  PROFILE_VIEW: 'profile_view',
} as const;

export const INTERACTION_EVENT_TYPE_VALUES = [
  INTERACTION_EVENT_TYPE.PROJECT_VIEW,
  INTERACTION_EVENT_TYPE.PROFILE_VIEW,
] as const;

const viewEventIdentitySchema = z.object({
  eventKey: z.uuid(),
  anonymousId: z.uuid(),
});

export const interactionEventTypeSchema = z.enum(INTERACTION_EVENT_TYPE_VALUES);
export type InteractionEventType = z.infer<typeof interactionEventTypeSchema>;

export const recordViewEventSchema = z
  .discriminatedUnion('type', [
    viewEventIdentitySchema
      .extend({
        type: z.literal(INTERACTION_EVENT_TYPE.PROJECT_VIEW),
        projectId: z.uuid(),
      })
      .strict(),
    viewEventIdentitySchema
      .extend({
        type: z.literal(INTERACTION_EVENT_TYPE.PROFILE_VIEW),
        designerProfileId: z.uuid(),
      })
      .strict(),
  ])
  .meta({ id: 'RecordViewEvent' });
export type RecordViewEvent = z.infer<typeof recordViewEventSchema>;

export const recordViewEventResponseSchema = z
  .object({
    recorded: z.boolean(),
  })
  .meta({ id: 'RecordViewEventResponse' });
export type RecordViewEventResponse = z.infer<typeof recordViewEventResponseSchema>;

export const projectEngagementQuerySchema = z
  .object({ projectIds: z.union([z.uuid(), z.array(z.uuid()).min(1).max(48)]) })
  .meta({ id: 'ProjectEngagementQuery' });
export type ProjectEngagementQuery = z.infer<typeof projectEngagementQuerySchema>;

export const projectEngagementSchema = z
  .object({
    projectId: z.uuid(),
    viewCount: z.number().int().nonnegative(),
    saveCount: z.number().int().nonnegative(),
  })
  .meta({ id: 'ProjectEngagement' });
export type ProjectEngagement = z.infer<typeof projectEngagementSchema>;

export const projectEngagementResponseSchema = z
  .object({ projects: z.array(projectEngagementSchema) })
  .meta({ id: 'ProjectEngagementResponse' });
export type ProjectEngagementResponse = z.infer<typeof projectEngagementResponseSchema>;
