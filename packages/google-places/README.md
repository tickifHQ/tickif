# Google Places client

Resolves a business reference and fetches its Google rating and recent reviews
using Places API (New). The API and worker require `GOOGLE_PLACES_API_KEY`, or its
`GOOGLE_PLACES_API_KEY_FILE` secret-file equivalent. See the
[staging deployment runbook](../../docs/runbooks/staging-deployment.md) for secret
mounting and rollout.

Accepted references include a raw place ID, a Maps URL containing a place ID,
a business name, a `share.google` link or a `maps.app.goo.gl` link. Short links
are resolved before Text Search, so the API searches the redirected business
name rather than the opaque share URL. Maps links containing `query_place_id`
can resolve without a Text Search request.

Link resolution permits only HTTPS on the explicit Google host allowlist, with
no credentials or nonstandard port. It follows at most five redirects under one
10-second timeout, rejects loops and off-list destinations, and never sends the
Places API key to redirect hosts. Unsupported Google links return a typed input error;
network failures return a typed network error. Existing free-text lookup remains
available.

Run `pnpm --filter @repo/google-places test` for deterministic client regression
tests; they stub Google responses and require no real credential or network.
