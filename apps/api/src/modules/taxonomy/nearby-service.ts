import { config } from '@repo/config';
import type { NearbyLocationInput } from '@repo/contracts';
import { AppError } from '../../lib/errors.js';
import { consumeNearbyLookupBudget } from '../../lib/redis.js';
import { reverseGeocodeCity } from './nearby-geocoder.js';
import { locationsRepository } from './locations-repository.js';

export async function findNearbyLocation(input: NearbyLocationInput) {
  if (!config.GOOGLE_PLACES_API_KEY) {
    throw new AppError('nearby_unavailable', 'Near me is unavailable. Choose a city instead.', 503);
  }
  if (!(await consumeNearbyLookupBudget())) {
    throw AppError.tooManyRequests('Near me is busy. Choose a city or try again in a minute.');
  }
  const names = await reverseGeocodeCity(input);
  const city = await locationsRepository.findCityByLabels(names);
  if (!city) throw AppError.notFound('Your city is not available yet. Choose a city instead.');
  return { city };
}
