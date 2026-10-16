import { config } from '@repo/config';
import { geocodingResponseSchema, type NearbyLocationInput } from '@repo/contracts';
import { AppError } from '../../lib/errors.js';

/** Resolve a city transiently; never persist coordinates or provider addresses. */
export async function reverseGeocodeCity(input: NearbyLocationInput): Promise<string[]> {
  if (!config.GOOGLE_PLACES_API_KEY) {
    throw new AppError('nearby_unavailable', 'Near me is unavailable. Choose a city instead.', 503);
  }
  const url = new URL('https://geocode.googleapis.com/v4/geocode/location');
  // City-level search does not need the device's full location precision.
  url.searchParams.set('location.latitude', input.latitude.toFixed(2));
  url.searchParams.set('location.longitude', input.longitude.toFixed(2));
  url.searchParams.set('languageCode', 'en');
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        'X-Goog-Api-Key': config.GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': 'results.addressComponents',
      },
      signal: AbortSignal.timeout(8000),
      redirect: 'error',
      cache: 'no-store',
    });
  } catch {
    throw AppError.badGateway('Could not find your city. Choose a city or try again.');
  }
  if (!response.ok) {
    // Never surface upstream bodies, keys or URLs containing location data.
    throw AppError.badGateway('Near me is temporarily unavailable. Choose a city instead.');
  }
  const parsed = geocodingResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success)
    throw AppError.badGateway('Could not read your city. Choose a city instead.');
  const addresses = parsed.data.results;
  const indianAddresses = addresses.filter((result) =>
    result.addressComponents.some(
      (part) => part.types.includes('country') && part.shortText === 'IN',
    ),
  );
  const names = indianAddresses.flatMap((result) =>
    result.addressComponents
      .filter((part) => part.types.includes('locality') || part.types.includes('postal_town'))
      .flatMap((part) => [part.longText, ...(part.shortText ? [part.shortText] : [])]),
  );
  return [...new Set(names)];
}
