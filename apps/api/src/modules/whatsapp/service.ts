import { randomInt, randomUUID } from 'node:crypto';
import type { SendWhatsappCode, VerifyWhatsappCode } from '@repo/contracts';
import { sendPhoneOtp } from '@repo/auth/phone-otp';
import { AppError } from '../../lib/errors.js';
import { hashWhatsappCode, whatsappRepository } from './repository.js';

export const whatsappService = {
  async send(userId: string, input: SendWhatsappCode) {
    const id = randomUUID();
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    if (
      !(await whatsappRepository.create({
        ...input,
        id,
        userId,
        codeHash: hashWhatsappCode(id, code),
      }))
    ) {
      throw AppError.tooManyRequests('Wait 60 seconds before requesting another WhatsApp code.');
    }
    try {
      await sendPhoneOtp({ phoneNumber: input.phoneNumber, code });
    } catch {
      await whatsappRepository.invalidate(id);
      throw AppError.badGateway('Could not send WhatsApp code. Please try again shortly.');
    }
    return { challengeId: id };
  },
  async verify(userId: string, input: VerifyWhatsappCode) {
    if (!(await whatsappRepository.verify(userId, input)))
      throw AppError.unprocessable('Invalid or expired WhatsApp code.');
    return { verificationId: input.challengeId };
  },
};
