# Visitor welcome form integration

The signed-in welcome form asks for home type and location. The preferences API
saves those answers and returns filters for the existing public feed. It does
not add a second search engine or make the cached public feed depend on a session.
Apply migration `0080_certain_wraith.sql` before deploying the API and web app.

## Web flow

New visitors see the welcome card inside their sign-in dialog after phone OTP.
Direct sign-in and interrupted onboarding use `/onboarding`. Both paths save
through the same API. Save and Skip refresh the session before continuing to
an original callback page, if supplied, or the personalized feed.
Name, address, and WhatsApp details are edited separately in `/home/settings`.

Active visitors can edit their choices from **Edit customization** on `/home`.
It opens a shared Dialog on the current page and reuses the welcome form's fields,
location selector, preview and save endpoint. Its backdrop reuses the neutral
`account-menu-overlay` token from logout confirmation, not the shared green overlay.
Edit mode omits the welcome panel
and uses **Edit customization**, **Cancel** and **Save changes** copy. Each opening
loads the latest saved preferences before exposing editable fields. Failed reads
offer Retry, not an empty form that could overwrite saved choices. Cancel, Close,
Escape and outside dismissal discard the draft without saving. Saving temporarily
blocks dismissal and duplicate writes; failures retain the draft for retry.
A successful save closes the dialog and applies the returned filters through
client navigation without a full document reload or forced scroll-to-top. The
same-URL case refreshes server-rendered data. The first-login welcome flow is unchanged.
Opening bare `/home` loads their saved defaults and redirects to explicit filter
parameters. `feed=custom` records that the current URL owns the filters, so
clearing all filters stays cleared across refresh and pagination. A new visit to
bare `/home` applies saved defaults again. Explicit search/filter URLs always win.

The signed-in home follows Figma frame `16123:62324`, using the shared header,
search, category artwork, filters and project cards. The greeting never displays
the generated phone-placeholder name. Summary chips describe the currently
applied filters, not saved choices that have been cleared. **For you** restores
saved defaults. **Explore** keeps a custom unfiltered URL. **Near you** is offered
only with a saved city, optionally narrowed to the saved locality; it is a
location filter, not a geographic distance ranking. The `view=explore|nearby`
query parameter is presentation state and is retained by search and pagination.
**Following** opens `/home?feed=custom&view=following`, with the real total from
the account-scoped following list. Its count and avatar rail share one client
read and refresh after confirmed follow changes and window focus. The private
`GET /api/following/feed` uses the session actor, not a caller-supplied account
identifier. It reuses discovery cards, filters, live-image metadata and taxonomy
labels through Postgres, including account-scoped facet counts. Search never
relaxes this feed into unrelated public projects. Drafts, inactive studios and
future publication dates are excluded; no search-index update is needed to see
a confirmed follow. Clear filters retains Following, and pagination retains its
scope. Empty feeds offer Find designers; failures retain Retry. The fixed view
controls wrap on narrow phones, while only photo chips scroll horizontally.

Visitor infinite-scroll loads use the three green progress dots and mono caption
from Figma `16123:62469`, only while fetching a subsequent page. The reusable
`LoadingDots` primitive uses Lucide Circles and semantic primary colors without
custom icon assets or animation, so reduced-motion users receive the same state.
The manual Load more control remains available when idle and after a failed read.

The greeting, enquiry summary and following row use the compact geometry of
Figma `16123:62326` and `16123:62361`: warm preference labels and an inline edit
link, a two-line enquiry card beside the greeting on wide screens, and
content-sized avatar links with unfilled NEW count labels. Narrow screens stack
the summary and wrap status text instead of clipping. Logo fitting remains
unchanged; only referred-project thumbnails opt into cover cropping.

Visitor category chips replace the previous room/budget shortcut while retaining
home, location and search criteria. Under ₹10L includes only active, known budget
bands whose upper bound is at most ₹10L, excluding crossing legacy ranges.
The visitor rail follows Figma `16123:62393`: compact For you/Near you controls,
the real saved locality (city fallback), a divider and inset circular category
artwork. Only the photo tags scroll horizontally, including on keyboard focus.
Focus reveals the complete chip within that rail, retaining its padding without
scrolling the page or moving adjacent controls. Horizontal overscroll stays
contained at the rail's boundaries instead of chaining into the page.
For you, Following, Near you and the divider stay outside the scroller; the Filters control
stays on the right. Narrow phones use two rows to keep all fixed controls reachable.
Long location labels truncate without widening the fixed controls; the full label
remains available in the link text and title.
The visitor view reuses the logged-out homepage's SlidersHorizontal Filters button
and the existing multi-select dropdown. Apply commits the draft; Clear all removes
filters and the view mode while retaining text search. Both footer actions use
the shared menu's keyboard navigation, and menus scroll within short viewports.
Duplicate applied chips
remain hidden in this presentation. Explore opens an unfiltered feed; For you
restores saved defaults. API filters and other surfaces remain intact. Missing categories/location labels are not
fabricated; taxonomy errors retain the existing retry flow.
The complete Boards feature, including Figma's Save to board picker, named-board
management and sharing, is deferred from this revamp. Save/Unsave continues to
use the existing flat saved-project list, without a board-selection step. See
[ADR 0014](../adr/0014-visitor-boards-deferral.md) for the accepted scope decision.

Saved projects and enquiries show real total counts, not unread counts. The
visitor header follows `16123:62325` with the warm translucent surface, neutral
Saved counter and terracotta Enquiries counter. Initials retain the original
DiceBear-generated identity colors and safe display name; real photos are retained.
Terracotta small text and the placeholder retain accessible
contrast rather than the low-contrast Figma values.
The latest enquiry shows tracked Sent, Viewed and Contacted milestones. Viewed is
recorded by the mounted studio lead details; Contacted is a persisted studio reply,
not a manually selected lead status or an inferred phone call. Replies are shown
in the requester's Enquiries page. NEW is requester-unread activity; opening the
enquiry acknowledges only the activity loaded, so a concurrent new reply stays NEW.
Historical Responded statuses do not invent missing milestone dates. Because you
saved uses the existing published-only similarity API
for the most recent visible save. These suggestions appear after the initial
discovery page, before additional infinite-scroll pages. The section is omitted
when there is no visible saved source or no public similar projects, and on
search, category-filtered or alternate-view feeds. Its heading uses baseline-aligned
text with a 6px spacing-scale gap, and the metadata sits 2px below in shared Mono/S
uppercase styling. Metadata reuses the existing primary-green token rather than
changing the global theme to Figma's lighter sample green; this preserves readable
small-text contrast. Long titles and metadata wrap on narrow screens.
Validated save events
update the icon immediately and refresh only the current account's saved count
through the existing uncached saved-projects API. A single listener serves the
desktop and mobile totals; superseded reads are cancelled. A failed count read
hides the unknown total and offers an inline retry without changing the feed.
The discovery cards, loaded infinite-scroll pages, scroll position and current
recommendation source remain stable while saving. Recommendations use the latest
saved source on the next navigation or explicit reload. The Saved projects page
retains its route refresh so removed cards and pagination stay accurate.
Equivalent server refreshes retain appended feed pages when cover or studio-logo
signatures rotate. The feed key compares stable media identities, while rendered
images receive the fresh signed URLs. Actual asset, project, filter or feed-scope
changes still reset pagination.

Functional icons in the shared search, filters and project-save
controls use `lucide-react`; room artwork, project imagery and studio/brand logos
remain image assets. The city selector reuses its shared Lucide dropdown indicator.
Visitor project cards show a 14px Lucide BadgeCheck immediately after a verified
studio name. `studioIsVerified` comes from a batched current database read of an
approved, unexpired verification application, using the existing public detail
policy. It is not inferred from a paid plan, phone login or the Figma sample.
Discovery, search, Following, saved feeds and similar-project suggestions share
this enrichment, so cached search documents cannot retain an expired/revoked
claim. Missing status and lookup failures hide the tick without blanking cards.
The optional contract field keeps older responses compatible. No verification
documents, identifiers or private application details are exposed.
The confirmed Following button reuses the Saved pill's shared Button variant and
size, with primary green and white text/icon. Only the following state uses this
variant; the unfollowed action keeps its existing outline treatment. Follow state,
login, pending and error handling are unchanged.
Public portfolio heroes place Follow before Enquire; the sharing section places
it between Send enquiry and Copy link. Both controls share one account-scoped
follow provider, including pending writes and retry state, so changing one updates
the other without reloading the page. Owned/unavailable studios omit the controls;
anonymous visitors use the existing in-page sign-in dialog and canonical callback.
The action rows wrap on narrow screens and use shared large Button sizing.
Visitor cards use a responsive 4:5 cover. On fine-pointer hover devices, an
unsaved bookmark is hidden at rest and revealed on card hover or keyboard focus.
On touch devices it stays visible and has a 44px target, so saving never depends
on hover. The bookmark expands left on button hover or keyboard focus while its
right edge stays fixed. Saved projects always show a green Saved pill at rest,
32px high on desktop with 14px icons; hover or keyboard
focus reveals Unsave with Lucide BookmarkOff. Touch activation toggles the same
save API directly. Pending writes disable the control, and failed writes retain
the confirmed state with an inline retryable error. Other card presentations
retain their existing save controls.

Both unsaved states use Figma's 94%-opaque white surface through semantic theme
tokens, not the previous mint/neutral pair. Their 200ms reveal clips the small
button surface and moves only the icon and label, keeping card layout stationary.
The clipped hit target matches the visible circle; keyboard focus expands it,
and reduced-motion preferences make the reveal immediate. The green Saved and
Unsave surfaces are unchanged.

All visitor card instances, including recommendations and additional feed pages,
show the real project budget as a compact 92%-opaque capsule. Null, empty or
whitespace budgets omit the capsule rather than inventing a price. A decorative
10px Mono/XS TICKIF label stays at the cover's bottom right, independent of hover.
The footer wraps on narrow cards to avoid collisions; both overlays pass clicks
through to the project link. Failed or missing images retain the real budget but
omit the photo label. The label is hidden from assistive technology and does not
alter the existing embedded image watermarks or signatures.

Saved projects retain the taxonomy label of their retired budget range in public
feeds, recommendations, project details and search results. Label reads are batched;
missing terms remain null. The active-only taxonomy endpoint and project picker
do not offer retired ranges for new projects. Project writes reject a newly
assigned inactive budget, but allow an existing saved value to remain unchanged
on edit. Switching away from a retired range does not make it selectable again.
Public reads still use the approved project projection, never a pending budget edit.

Visitor cards use `studioLogoUrl` from discovery, project search and similarity
responses. The API resolves the current saved public studio logo in one batched
lookup per page and signs each distinct key once, without changing the search
index or making a browser request per card. Only published projects from active
studios qualify. Missing media, signing/lookup failures and older cached responses
retain the existing initials fallback; replacing a failed URL recovers the image.

Activity reads forward the session cookie and disable caching. Failed reads do
not appear as zero or erase successful regions. Feed, taxonomy, customization,
activity and similarity failures are retryable without clearing the current URL.
Story updates, sponsored placements, phone-call milestones,
room-specific feed cards and corporate verification seals are not
fabricated: their visitor-feed data/workflows are not available. The standalone
Cities directory is also absent; existing city search/filter controls remain
available. Sample Figma names, photos and counts are never used as account data.

The following rail uses `GET /api/following`, with a paginated full list at
`/home/following`. The image-detail studio card uses UserPlus to follow and UserCheck
for the confirmed Following state. PUT/DELETE are idempotent and account-scoped.
NEW counts include published projects added since following or the last opened
portfolio, never private/pending projects. Portfolio visits acknowledge through
the payload request's starting timestamp; cached Back navigation refreshes only
the rail. Missing images retain the shared avatar fallback. Incomplete or disabled
portfolios show an unavailable label instead of a dead link.

Studio messages are sent from the lead details with an idempotency UUID and are
private to the enquiry requester and authorized studio members. Closed/spam leads
reject new replies; read-only members cannot send. Failed sends retain the draft.
The requester can refresh messages without a full-page reload. Live chat and
SMS/email message notifications are not part of this scope. Deploy migrations
0084 and 0085 before enabling these surfaces. See
[ADR 0011](../adr/0011-visitor-following-and-enquiry-milestones.md).

Read acknowledgements preserve the full PostgreSQL timestamp through an opaque
`readThrough` string in the activity and message-thread responses. Clients compare
these UTC strings without converting the watermark back through JavaScript Date.
The list and count APIs use the same exact database comparison, so submillisecond
precision cannot leave a read enquiry NEW or hide a newer reply in the same
millisecond. The thread acknowledges only after its messages have rendered in a
visible tab; hidden tabs wait for visibility. Failed acknowledgements retain Retry.
The enquiry detail view separates the progress row and studio header with a
spacing-scale margin, without changing the compact home summary.
Its sidebar shows a small green Lucide Circle for each enquiry with unread
activity, plus accessible "Unread updates" text. A confirmed read removes only
that enquiry's indicator without reloading the inbox. Failed reads retain it,
and a delayed acknowledgement cannot hide a newer loaded activity watermark.
Unknown activity data does not invent an unread dot.

The visitor desktop header follows Figma node `16123:62325`: a 72px bar with
48px side insets, a 470px by 42px search surface, 34px Label/M navigation tabs,
40px Label/S activity links, 16px Mono/XS counters and a 32px account avatar.
Shared opt-in Button, Badge and SelectTrigger variants own control geometry;
defaults elsewhere remain unchanged. Below desktop width, the same search instance
moves to a full-width row and primary links reflow without horizontal page overflow.
The supported routes, counter retry/read behavior and DiceBear identity colors
are preserved. Figma's unsupported Cities destination remains omitted.

Navbar compositions use rem-based spacing-scale utilities and semantic theme
tokens, not arbitrary pixel utilities. Search group labels use the shared
`searchLabel` typography role; the style-policy test guards the navbar sources
while Playwright verifies the measured geometry.

The home header always shows the total enquiry count, including zero, through
`GET /api/enquiries/counts`. It adds `NEW` when the same response reports unread
activity, and removes only that label once updates are read. The visible number
is never a message or unread count. Desktop and mobile share one private count
provider, refreshed on activation, focus and every 30 seconds while visible.
Hidden tabs do not poll. Failures show Retry without erasing the feed or showing
a false zero. Inbox/account-menu totals are unchanged. See
[ADR 0013](../adr/0013-persistent-enquiry-total-and-unread-label.md) and the retained
API/read rules in [ADR 0012](../adr/0012-visitor-unread-enquiry-counter.md).

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
