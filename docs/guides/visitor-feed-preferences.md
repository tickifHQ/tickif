# Visitor welcome form integration

The signed-in welcome form asks for home type and location. The preferences API
saves those answers and returns filters for the existing public feed. It does
not add a second search engine or make the cached public feed depend on a session.
Apply migration `0079_blue_blue_marvel.sql` before deploying the API and web app.

## Web flow

New visitors see the welcome card inside their sign-in dialog after phone OTP.
Direct sign-in and interrupted onboarding use `/onboarding`. Both paths save
through the same API. Save and Skip refresh the session before continuing to
an original callback page, if supplied, or the personalized feed.

Active visitors can edit their choices from **Personalize your feed** on `/home`.
Opening bare `/home` loads their saved defaults and redirects to explicit filter
parameters. `feed=custom` records that the current URL owns the filters, so
clearing all filters stays cleared across refresh and pagination. A new visit to
bare `/home` applies saved defaults again. Explicit search/filter URLs always win.

The combined location selector loads active cities and localities, matches each
locality to its parent city, and offers other localities in that city. The optional
preview uses live search results and the shared `visitorFeedFilters` mapping.
Loading or save errors retain choices. Location loading can be retried, and Skip
remains available. The form shows no invented trust, rating, or proximity claims.

## Load the form

Call `GET /api/visitors/me/feed-preferences` with the session cookie in personal
context. A new visitor receives:

```json
{ "preferences": null, "filters": {} }
```

A null preference means the visitor has not answered this form. A preference
object with all three values null means they explicitly skipped it. Use that
distinction to avoid reopening the form after Skip.

The home choices are:

| Label  | `homeType`   | Returned home filter                                           |
| ------ | ------------ | -------------------------------------------------------------- |
| 1 BHK  | `1-bhk`      | `bhkSlug=1-bhk`                                                |
| 2 BHK  | `2-bhk`      | `bhkSlug=2-bhk`                                                |
| 3 BHK  | `3-bhk`      | `bhkSlug=3-bhk`                                                |
| 4 BHK+ | `4-plus-bhk` | Both `4-bhk` and `4-plus-bhk`                                  |
| Villa  | `villa`      | `propertyTypeSlug=residential` and `propertySubtypeSlug=villa` |

Use `GET /api/taxonomy/terms?kind=city` for active cities. After selecting one,
use `GET /api/taxonomy/terms?kind=locality&parentId=<city-id>` for its localities.
Send the selected slugs when saving. Clear the locality when the city changes.
A locality from another city, an inactive term, or an unknown slug returns 422.
The location selector must resolve free text to a taxonomy selection before saving.
The taxonomy endpoint lists localities; it does not rank geographic proximity.

## Save and show the feed

Send all three fields to `PUT /api/visitors/me/feed-preferences`:

```json
{
  "homeType": "3-bhk",
  "citySlug": "chennai",
  "localitySlug": "adyar"
}
```

The response is:

```json
{
  "preferences": {
    "homeType": "3-bhk",
    "citySlug": "chennai",
    "localitySlug": "adyar"
  },
  "filters": {
    "bhkSlug": "3-bhk",
    "citySlug": "chennai",
    "localitySlug": "adyar"
  }
}
```

Pass those filters to `GET /api/discovery/feed` with pagination, or to
`GET /api/search` when using the search result interface. Encode array
values as repeated query parameters. For example, the 4 BHK+ selection uses:

```text
/api/discovery/feed?bhkSlug=4-bhk&bhkSlug=4-plus-bhk&citySlug=chennai&localitySlug=adyar&page=1
```

After saving, reset pagination and the feed cache to the new filter query. On a
later visit, load the saved filters before requesting a personalized feed. An
explicit filter edit in the feed should take precedence over saved defaults.
These account endpoints use `Cache-Control: private, no-store`; the public feed
continues to use its existing query-based cache.

Each field may be null independently, except that a locality requires a city.
For Skip, send all three fields as null, then request the unfiltered feed. A
successful save or skip completes visitor onboarding and activates a pending
visitor atomically. Existing address and WhatsApp details are preserved. Updating
those details through `PUT /api/visitors/me` also preserves feed preferences.

## Preview count and empty results

The existing search response exposes `estimatedTotalHits`, `fallback`, and
`relaxedFilters`. Only use its count for the selected filters when `fallback` is
`none`. A relaxed or `recent_in_city` result does not count exact matches; show
zero exact matches and label broader suggestions separately. An empty feed with
no text query keeps the selected filters rather than silently widening them.

The screenshot's "verified projects" wording cannot be inferred from this count.
Public visibility means a published project from an active designer, not a
verification claim. Use "projects" for this estimate. Geographic "nearby"
ranking is also not part of these APIs.

## Authentication and failures

Only pending or active visitors can read or save these preferences. Designer,
admin, superadmin, banned, suspended, and deleted accounts cannot use this flow.
The server identifies the account from the session; the body accepts no user ID.

- 401: sign in before saving, then retry the user's choices.
- 403: do not keep retrying; the account or selected context is ineligible.
- 422: preserve the form values and show the validation error.
- Network or server failure: keep the form open and retry. Do not show a saved state.

Use the schemas and inferred types exported by `@repo/contracts` and the existing
Hono client. The OpenAPI document includes both endpoints. The web implementation
is in `visitor-onboarding-form.tsx`, `visitor-login-continuation.tsx`, and the
`/onboarding` and `/home` server pages.
