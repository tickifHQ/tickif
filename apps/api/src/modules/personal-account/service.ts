import type { PersonalAccount, UpdatePersonalAccountInput } from '@repo/contracts';
import { AppError } from '../../lib/errors.js';
import { personalAccountRepository } from './repository.js';

export const personalAccountService = {
  async access(
    userId: string,
    sessionId: string,
    input?: UpdatePersonalAccountInput,
  ): Promise<PersonalAccount> {
    const result = await personalAccountRepository.access(userId, sessionId, input);
    if (result.kind === 'forbidden')
      throw AppError.forbidden('Personal settings require an active personal account');
    if (result.kind === 'conflict')
      throw AppError.conflict(
        'Your settings changed elsewhere. Reload the latest settings before saving again.',
      );
    if (result.kind !== 'ok') throw new Error('Unexpected personal account result');
    return result.account;
  },
};
