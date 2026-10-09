import { z } from 'zod';

export const EARLY_BIRD_DEADLINE = '2026-12-31T18:30:00.000Z'; // 1 Jan 2027, 00:00 IST; exclusive
export const EARLY_BIRD_MONTHS = 3;
export const earlyBirdTierSchema = z
  .enum(['professional_plus', 'corporate'])
  .meta({ id: 'EarlyBirdTier' });
export const earlyBirdClaimSchema = z
  .object({ targetTier: earlyBirdTierSchema })
  .meta({ id: 'EarlyBirdClaim' });
export const earlyBirdTrialSchema = z
  .object({
    tier: earlyBirdTierSchema,
    startedAt: z.string().datetime(),
    endsAt: z.string().datetime(),
  })
  .meta({ id: 'EarlyBirdTrial' });
export const earlyBirdStatusSchema = z
  .object({
    eligible: z.boolean(),
    trial: earlyBirdTrialSchema.nullable(),
  })
  .meta({ id: 'EarlyBirdStatus' });
export type EarlyBirdTrial = z.infer<typeof earlyBirdTrialSchema>;
export type EarlyBirdStatus = z.infer<typeof earlyBirdStatusSchema>;
export type EarlyBirdTier = z.infer<typeof earlyBirdTierSchema>;

/** Calendar months in India, clamping month-end rather than overflowing it. */
export function earlyBirdEndsAt(start: Date): Date {
  const offset = 330 * 60_000;
  const local = new Date(start.getTime() + offset);
  const day = local.getUTCDate();
  local.setUTCDate(1);
  local.setUTCMonth(local.getUTCMonth() + EARLY_BIRD_MONTHS);
  const lastDay = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0),
  ).getUTCDate();
  local.setUTCDate(Math.min(day, lastDay));
  return new Date(local.getTime() - offset);
}
