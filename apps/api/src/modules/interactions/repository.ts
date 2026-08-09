import { and, db, eq, schema } from '@repo/db';
import type { INTERACTION_EVENT_TYPE } from '@repo/contracts';

type ViewEventIdentity = {
  eventKey: string;
  anonymousId: string;
  actorUserId: string | null;
};

export type InsertViewEvent = ViewEventIdentity &
  (
    | {
        type: typeof INTERACTION_EVENT_TYPE.PROJECT_VIEW;
        projectId: string;
        designerProfileId: null;
      }
    | {
        type: typeof INTERACTION_EVENT_TYPE.PROFILE_VIEW;
        projectId: null;
        designerProfileId: string;
      }
  );

export const interactionsRepository = {
  async isPublicProject(projectId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: schema.project.id })
      .from(schema.project)
      .innerJoin(schema.designerProfile, eq(schema.designerProfile.id, schema.project.designerId))
      .where(
        and(
          eq(schema.project.id, projectId),
          eq(schema.project.status, 'published'),
          eq(schema.designerProfile.status, 'active'),
        ),
      )
      .limit(1);

    return row !== undefined;
  },

  async isActiveDesignerProfile(designerProfileId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: schema.designerProfile.id })
      .from(schema.designerProfile)
      .where(
        and(
          eq(schema.designerProfile.id, designerProfileId),
          eq(schema.designerProfile.status, 'active'),
        ),
      )
      .limit(1);

    return row !== undefined;
  },

  async insertViewEvent(input: InsertViewEvent): Promise<boolean> {
    const rows = await db
      .insert(schema.interactionEvent)
      .values(input)
      .onConflictDoNothing({ target: schema.interactionEvent.eventKey })
      .returning({ id: schema.interactionEvent.id });

    return rows.length === 1;
  },
};
