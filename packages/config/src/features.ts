import { z } from 'zod';
import { loadRootEnv } from './load-env.js';

export const featureFlagsSchema = z.object({
  CONSULTATIONS_ENABLED: z.stringbool().optional().default(false),
});

export function parseFeatureFlags(environment: NodeJS.ProcessEnv) {
  const result = featureFlagsSchema.safeParse(environment);
  if (!result.success) throw new Error('Invalid CONSULTATIONS_ENABLED feature flag');
  return result.data;
}

loadRootEnv();

/** Web servers need feature flags, without API/storage/authentication credentials. */
export const config = parseFeatureFlags(process.env);
