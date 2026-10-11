import type { CreateLocationInput } from '@repo/contracts';
import { AppError } from '../../lib/errors.js';
import { locationsRepository } from './locations-repository.js';

export const locationsService = {
  async create(input: CreateLocationInput) {
    const city = input.citySlug
      ? await locationsRepository.findCity(input.citySlug)
      : await locationsRepository.ensureCity(input.cityLabel!);
    if (!city) {
      if (input.citySlug) throw AppError.unprocessable('Choose an active city.');
      throw AppError.conflict('This city is unavailable. Choose another name.');
    }
    const locality = input.localityLabel
      ? await locationsRepository.ensureLocality(city.id, input.localityLabel)
      : null;
    if (input.localityLabel && !locality)
      throw AppError.conflict('This area is unavailable. Choose another name.');
    return { city, locality };
  },
};
