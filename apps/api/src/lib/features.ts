import { config } from '@repo/config';

export const features = Object.freeze({
  consultations: config.CONSULTATIONS_ENABLED,
});
