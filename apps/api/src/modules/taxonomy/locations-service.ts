import { createHash } from 'node:crypto';
import type { CreateLocationInput } from '@repo/contracts';
import { AppError } from '../../lib/errors.js';
import { locationsRepository } from './locations-repository.js';

function locationSlug(label: string): string {
  const normalized = label.normalize('NFKD').toLowerCase();
  const slug = normalized
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  // Support local-script city names without violating the URL-safe database constraint.
  const digest = createHash('sha256').update(normalized).digest('hex').slice(0, 20);
  if (!slug) return `location-${digest}`;
  return slug.length <= 80 ? slug : `${slug.slice(0, 59).replace(/-+$/, '')}-${digest}`;
}

export const locationsService = {
  async create(input: CreateLocationInput) {
    const city = input.citySlug
      ? await locationsRepository.findCity(input.citySlug)
      : await locationsRepository.ensureCity(input.cityLabel!, locationSlug(input.cityLabel!));
    if (!city) {
      if (input.citySlug) throw AppError.unprocessable('Choose an active city.');
      throw AppError.conflict('This city is unavailable. Choose another name.');
    }
    const locality = input.localityLabel
      ? await locationsRepository.ensureLocality(
          city.id,
          input.localityLabel,
          locationSlug(input.localityLabel),
        )
      : null;
    if (input.localityLabel && !locality)
      throw AppError.conflict('This area is unavailable. Choose another name.');
    return { city, locality };
  },
};
