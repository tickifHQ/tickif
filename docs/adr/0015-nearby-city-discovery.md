# ADR 0015 — City-level nearby discovery

Status: Proposed
Date: 2026-10-16
Supersedes: None; supplements [ADR 0010](./0010-saved-custom-location-classification.md)
Superseded by: None

## Context

E-367 requests reusable custom cities and areas, saved-location discovery, and
consideration of nearby search. The user requested implementation of both saved
location discovery and Near me. Projects currently have canonical city and area
labels, without reliable coordinates for distance-based project search.

## Decision

Offer Near me as city-level discovery. Before requesting device permission, show
a disclosure explaining that approximate device coordinates are sent through
Tickif to Google Maps to resolve a city. Round both coordinates to two decimal
places in the browser and server. Send coordinates in a POST body to the API;
only the matched canonical city slug enters the resulting homepage URL. Do not
persist device coordinates or provider address responses, create taxonomy terms
from a lookup, or write the lookup into search activity. Existing telemetry
exports allowlisted attributes and exclude request URLs, query values and bodies.

Use Google's Geocoding API v4 with the existing server-only
`GOOGLE_PLACES_API_KEY`, an address-components-only field mask, and an eight-second
timeout. The Google Cloud project must enable this API for that key. Match Indian
city components to active saved cities by the same normalized identity used for
custom locations. Return an actionable error for an unsupported or unknown city,
provider failure, denied permission, or unavailable device location. Never silently
replace the selected location with another city.

A Redis-backed, shared budget allows at most 30 upstream lookups per fixed
60-second window (the first request starts the window), across API instances.
Redis outages fail closed for paid lookups. The API retries a failed Redis
connection on the next request after a 30-second cooldown, so recovery does not
require an API restart. The budget stores no visitor or
location identifiers. This is a cost ceiling, not per-visitor abuse protection;
one caller can exhaust it. Manual city selection remains available.

Location autocomplete bypasses HTTP caches and reads canonical active taxonomy terms directly, so a saved
city can be found without a published project and without the Typesense index.
Area suggestions include and apply their parent city, preventing identical area
names in different cities from mixing. Public project visibility rules remain in
force: a saved draft does not become discoverable through these additions.

## Alternatives and consequences

Distance/radius search would require reliable project coordinates, geocoding and
backfill policies, and corresponding database/search-index changes. It is not
claimed by this city-level implementation. The UI explicitly describes city-wide
results rather than distance ranking. An empty city feed is legitimate when no
approved project matches; location suggestions must not expose draft projects.

Google reverse geocoding is a new use of the existing provider credential and a
new transient location-data boundary. Browser permission and disclosure are
required on explicit user action; there is no background geolocation. Google
availability, quota, billing and key restrictions are deployment prerequisites.
Rounding can affect city-boundary matches; users can always choose manually.

This decision is Proposed pending review of the city-level scope, provider setup
and budget policy. No acceptance of future distance/radius behavior is implied.
See [the E-367 test guide](../guides/custom-location-discovery-testing.md).
