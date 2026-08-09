import {
  INTERACTION_EVENT_TYPE,
  type RecordViewEvent,
  type RecordViewEventResponse,
} from '@repo/contracts';
import { AppError } from '../../lib/errors.js';
import { interactionsRepository } from './repository.js';

type RecordViewInput = {
  actorUserId: string;
  event: RecordViewEvent;
};

export const interactionsService = {
  async recordView(input: RecordViewInput): Promise<RecordViewEventResponse> {
    if (input.event.type === INTERACTION_EVENT_TYPE.PROJECT_VIEW) {
      const isPublic = await interactionsRepository.isPublicProject(input.event.projectId);
      if (!isPublic) {
        throw AppError.notFound();
      }

      return {
        recorded: await interactionsRepository.insertViewEvent({
          ...input.event,
          actorUserId: input.actorUserId,
          designerProfileId: null,
        }),
      };
    }

    const isActive = await interactionsRepository.isActiveDesignerProfile(
      input.event.designerProfileId,
    );
    if (!isActive) {
      throw AppError.notFound();
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
