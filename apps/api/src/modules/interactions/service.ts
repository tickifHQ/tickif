import {
  INTERACTION_EVENT_TYPE,
  type RecordViewEvent,
  type RecordViewEventResponse,
  type ProjectEngagementQuery,
  type ProjectEngagementResponse,
} from '@repo/contracts';
import { AppError } from '../../lib/errors.js';
import { interactionsRepository } from './repository.js';

type RecordViewInput = {
  actorUserId: string;
  event: RecordViewEvent;
};

export const interactionsService = {
  async projectCounts(query: ProjectEngagementQuery): Promise<ProjectEngagementResponse> {
    const ids = Array.isArray(query.projectIds) ? query.projectIds : [query.projectIds];
    return { projects: await interactionsRepository.projectCounts([...new Set(ids)]) };
  },

  async recordView(input: RecordViewInput): Promise<RecordViewEventResponse> {
    if (input.event.type === INTERACTION_EVENT_TYPE.PROJECT_VIEW) {
      const orgId = await interactionsRepository.findPublicProjectOrgId(input.event.projectId);
      if (!orgId) {
        throw AppError.notFound();
      }
      if (await interactionsRepository.isOrgMember(input.actorUserId, orgId)) {
        return { recorded: false };
      }

      return {
        recorded: await interactionsRepository.insertViewEvent({
          ...input.event,
          actorUserId: input.actorUserId,
          designerProfileId: null,
        }),
      };
    }

    const orgId = await interactionsRepository.findActiveDesignerOrgId(
      input.event.designerProfileId,
    );
    if (!orgId) {
      throw AppError.notFound();
    }
    if (await interactionsRepository.isOrgMember(input.actorUserId, orgId)) {
      return { recorded: false };
    }

    return {
      recorded: await interactionsRepository.insertViewEvent({
        ...input.event,
        actorUserId: input.actorUserId,
        projectId: null,
      }),
    };
  },
};
