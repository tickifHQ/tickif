import { z } from 'zod';
import { upsertVisitorProfileSchema } from './visitors';

const revisionSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const updatePersonalAccountSchema = upsertVisitorProfileSchema
  .extend({
    name: z.string().trim().min(2).max(100),
    revision: revisionSchema,
  })
  .strict()
  .meta({ id: 'UpdatePersonalAccount' });
export type UpdatePersonalAccountInput = z.infer<typeof updatePersonalAccountSchema>;

export const personalAccountSchema = upsertVisitorProfileSchema
  .extend({
    name: z.string(),
    email: z.string(),
    emailVerified: z.boolean(),
    phoneNumber: z.string().nullable(),
    phoneNumberVerified: z.boolean(),
    revision: revisionSchema,
  })
  .strict()
  .meta({ id: 'PersonalAccount' });
export type PersonalAccount = z.infer<typeof personalAccountSchema>;
