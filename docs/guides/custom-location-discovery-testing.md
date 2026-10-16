# Custom locations and Near me (E-367)

Use the local stack from [getting started](./getting-started.md). The web app is
at `http://localhost:3000`; use the API port configured in the local environment.
Run `pnpm dev` with Postgres and Redis available. No database migration is needed.
Preserve the existing deployment `pnpm db:seed` step for older free-text city
classification described in [ADR 0010](../adr/0010-saved-custom-location-classification.md).

## Custom location entry and discovery

1. Sign in as a designer and open `/designer/projects/upload`.
2. In project details choose the custom city/area actions, enter a unique city
   and area, complete the required details and save the draft. Reload and confirm
   both fields retain their values.
3. On `/`, type the saved city into Search homes. Its suggestion should be marked
   City. Choose it: the URL applies `city=<canonical-slug>`, clears stale area and
   pagination values, and preserves other filters.
4. Type the area instead. Its suggestion should include the city label. Choose
   it: both `city` and `locality` are applied. Test two cities with the same area
   name and verify the correct city travels with each suggestion.
5. A draft must not appear publicly. In an isolated test environment, publish a
   project through the normal review workflow in the custom city/area and confirm
   filtering finds it. Projects in another city's identically named area must not
   match. An empty feed before publication is expected, not a location-save failure.
6. With the search index temporarily unavailable in an isolated environment,
   confirm saved-location suggestions remain usable. Do not stop a shared service
   solely for this test; service tests also cover index failure with mocks.

## Near me

The server key in `GOOGLE_PLACES_API_KEY` must have Google's Geocoding API v4
enabled, with appropriate API/server restrictions and billing. A missing key
produces a clear unavailable message. A Places/reviews-only key may be rejected
by Geocoding; enabling the API is an operator action. See Google's
[reverse-geocoding documentation](https://developers.google.com/maps/documentation/geocoding/reverse-geocoding).

1. Open the homepage and activate the locate icon labelled Near me. Confirm the
   disclosure appears and no location prompt occurs until Use my location.
2. Select Choose a city instead, or close the dialog. Existing filters must stay
   unchanged, and no location lookup should occur.
3. Use browser developer tools' location override with a known saved Indian city,
   then choose Use my location and allow the browser permission. Confirm loading
   feedback, a city-only result URL, preserved non-location filters, and no device
   coordinates in the page URL or recent-search storage. This is city-wide search,
   not a distance/radius ranking. Approximate boundary matches can be corrected
   by choosing a city manually.
4. Deny permission; test a timeout/unavailable location, an unknown city, and a
   rejected/missing provider key. Each must show an actionable error without
   changing the existing results. Retry after restoring availability.
   Device lookup allows 20 seconds. A timeout and an unavailable device position
   have separate guidance; neither calls the city-resolution API. For an
   unavailable position on Windows, check Settings → Privacy & security → Location
   and the browser's site location permission. Enabling website permission alone
   cannot make an unavailable device location provider return a position.
5. Cancel while lookup is pending. A late device/provider response must not
   navigate. Test repeated clicks: one dialog interaction must issue one lookup.
6. Repeat on a mobile viewport and `/home`. Signed-in visitor searches must stay
   on `/home` with `feed=custom` rather than returning to the public landing page.

The API accepts bounded numeric latitude/longitude in a POST body, rounds to two
decimal places and returns only an active taxonomy city. Responses use private,
no-store caching. The shared Redis budget permits 30 provider calls per minute;
busy/unavailable Redis produces a retry/manual-selection message. After a Redis
outage, restore Redis and retry after 30 seconds; lookup should recover without
restarting the API. Automated tests
mock device location and Google and do not transmit a real user's location.
