import { z } from 'zod';
import { e164PhoneNumberSchema } from './common';

export const whatsappTargetSchema = z
  .union([
    z.literal('personal'),
    z.literal('onboarding'),
    z.string().regex(/^profile:[0-9a-f-]{36}$/),
  ])
  .meta({ id: 'WhatsappTarget' });
export const sendWhatsappCodeSchema = z
  .object({ phoneNumber: e164PhoneNumberSchema, target: whatsappTargetSchema })
  .strict()
  .meta({ id: 'SendWhatsappCode' });
export const verifyWhatsappCodeSchema = sendWhatsappCodeSchema
  .extend({ challengeId: z.uuid(), code: z.string().regex(/^\d{6}$/) })
  .strict()
  .meta({ id: 'VerifyWhatsappCode' });
export const whatsappChallengeResponseSchema = z
  .object({ challengeId: z.uuid() })
  .meta({ id: 'WhatsappChallengeResponse' });
export const whatsappProofResponseSchema = z
  .object({ verificationId: z.uuid() })
  .meta({ id: 'WhatsappProofResponse' });
export type SendWhatsappCode = z.infer<typeof sendWhatsappCodeSchema>;
export type VerifyWhatsappCode = z.infer<typeof verifyWhatsappCodeSchema>;
