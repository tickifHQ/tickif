# Public landing page

The homepage implements the [logged-out Figma frame](https://www.figma.com/design/WJhOguDptAwt2735BS2WMG/tickif--DS-?node-id=16095-51371)
after PR #713's designer-profile refresh in the stack rooted at PR #710's shared UI.
It is scoped to `/`; signed-in visitor routing,
designer/admin routing and other public pages retain their existing behavior.

## Data and interactions

- The server loads taxonomy and the recent/featured discovery feeds concurrently
  through the typed Hono client, validating responses with `@repo/contracts`.
- Hero project photography and captions use the first three featured projects with cover
  images, falling back to the recent feed when no featured projects exist. Missing
  images do not fall back to sample photography.
- The headline photo pill and both chip rows use local Figma exports as editorial
  artwork. Landing categories follow the design's order and resolve only existing
  taxonomy slugs; empty categories remain discoverable. Labels reflect supported
  filters (3BHK homes, ₹5L–₹10L, Workspaces), not unsupported price/view promises.
- Project and designer search totals populate the hero statistic cards. Each
  source can fail independently; unavailable totals become descriptive copy,
  never sample counts. Studio logos/initials come from designer search results.
- Featured discovery shows up to 12 projects; recent discovery starts with the
  canonical 24-project API page. Its explicit load-more control keeps the directory
  and designer signup reachable. Filtered/search results retain automatic loading.
- The landing grid reaches six columns at 1440px, matching the supplied
  1512px frame, capped at the number of real results. Landing cards have a maximum
  width of 320px, so sparse and filtered feeds stay compact and left aligned.
  Landing photographs use a consistent 285px crop (240px on mobile), with studio
  initials and metadata below. Allocation uses equal card heights; other feeds
  retain their natural image ratios and existing breakpoints.
- `ShowcaseCard` has a landing presentation with visible title, studio, location,
  tags and budget. Other routes retain the existing overlay presentation.
- The hero and header city pickers use taxonomy options. The header fetches the
  public city taxonomy and supports Control/Command K without a visible shortcut
  button. The header forms a layer above the hero so suggestions remain unobscured.
  Search and suggestions preserve
  filters, reset pagination and navigate to the existing discovery/search route.
- Bookmarks reuse `ProjectActions` and the saved-project endpoints. Anonymous
  visitors enter the existing login dialog; repeated project cards synchronize
  successful saves within the page.
- Browse links use taxonomy slugs and real filter URLs. They are labelled
  “Explore”, not “Popular”, because taxonomy is not a popularity measure.
- The scroll login gate retains OTP/Google authentication and dismissal behavior.
  Its landing presentation omits unsourced usage counts, ratings and avatars.
  A small context shares server-fetched project previews with the sibling gate;
  it makes no additional request and clears previews when leaving the homepage.
  Its backdrop begins fading only when the panel enters the viewport, so the
  hero remains undimmed while the prompt is below the fold.
  Measurement and display share one mounted form and the same scroll container,
  so responsive eligibility changes cannot repeatedly remount the authentication
  controls. The mobile navigation wraps at narrow widths to avoid page overflow.
- `GET /api/billing/plans` supplies server-configured prices, tier features and the
  current promotion. The homepage validates this response and never invents prices
  on failure. Pricing cards use Hobby, Professional+ and Corporate; the design's
  outdated tier labels, Corporate amount and enquiry paywall copy are replaced.
- The early-bird strip and paid-card buttons follow the public offer. They lead to
  `/early-bird?plan=…`, preserving the selected plan through authentication and
  first-time designer onboarding. The completion link opens
  `/designer/early-bird?plan=…`; an explicit authenticated confirmation then claims
  the no-card trial. Active visitor accounts retain the existing separate-account
  policy. Open billing operations also make an organization ineligible, including
  provider checkouts whose outcome is still being reconciled and whose provider ID
  has not been saved. Claims recheck this condition under the organization billing
  lock; a definitive failed operation releases that block. See
  [ADR 0004](../adr/0004-early-bird-trials.md) for eligibility and expiry policy.

## Content boundaries

No Figma sample project, designer, price, testimonial or platform total is used as
live content. The existing public contracts do not supply the sponsorship campaign,
homeowner-verified cost status, or aggregate room totals. Those sections are omitted or replaced by factual
navigation/signup copy until a product decision and real API source are available.
The approved early-bird offer has unlimited availability; no city scarcity or
popularity badge is fabricated. The pricing sticker says “Recommended”, as approved
by the product owner. The designer heading's Figma photo and three portraits are
decorative editorial artwork, not customer identities or testimonials.
Company/legal destinations absent from the app are not
rendered as placeholder links; the Company column shows disabled labels until
the product owner supplies their destinations.

## Design provenance

High-fidelity Figma contexts: header `16095:51372`, hero `16095:51374`, cards and
filters `16095:51461`, sponsorship `16095:51533`, recent feed/login `16095:51539`,
pricing `16095:51977`, directory `16095:52184`, footer `16095:52291`.

The landing palette is scoped through `data-landing` in the Tickif theme. Display
type uses Helvetica Neue where installed, otherwise the already loaded Inter;
no font files are added. Responsive layouts adapt the supplied desktop frame.

Exact local SVG exports live in `apps/web/public/images/landing/`. Their intrinsic
dimensions are preserved: logo mark 25.5177 × 25.9999; wordmark 63.2349 × 17.7841;
search 20 × 20; submit search 18 × 18; badge check 24 × 24; arrow 13 × 13;
bookmarks 16 × 16; header search 15 × 15; location 14 × 14. Decorative headline
photography and 26/28px chip thumbnails are also exported from the corresponding
Figma layers. Project/card photographs remain API supplied. Figma render images are reference evidence only and are not
application assets.

`app/landing-motion.css` adapts the supplied Anika Spaces HTML's staggered
entrances, hover lift and slow image zoom, plus the requested seamless offer ticker
and hanging badges. Its pause control stops both continuous effects; hover/focus
also pauses the ticker. Shared `@repo/ui/Reveal` uses IntersectionObserver for
one-time card and headline fades, disconnects after entry, reveals focused content
immediately, and leaves server content visible without JavaScript or observer support.
Reduced motion disables animation and displays one wrapped ticker copy. The reference
HTML is not executed or shipped. Pricing details use nodes `16095:52015` and
`16095:52034`; local exports retain their original pixels and intrinsic SVG dimensions.

## Verification

Run the standard `pnpm typecheck`, `pnpm lint` and `pnpm test` gates. Focused web
tests cover API-derived hero content, missing-image behavior, taxonomy links, city
search, card metadata, bookmark persistence/synchronization and login copy. Existing
redirect, pagination, filtering and authentication tests remain applicable.

For visual review, run `pnpm --filter @repo/web dev` on port 3000 against a configured
API with published projects. Check desktop 1512px, tablet 768px and mobile 390px,
search/city navigation, filters, card destinations, bookmarks and the dismissible
login prompt. An empty real API can verify the empty state and controls, but does
not establish visual acceptance of populated photo layouts or authenticated saves.
The documented staging API can supply a populated server-rendered visual review;
browser-side search and authentication also require an origin allowed by its CORS
policy. Do not treat a CORS-blocked preview as a full interaction check.

## Early-bird local testing

Apply migrations with `pnpm db:migrate`, then run the API, web and worker with
`pnpm dev`. The public `GET /api/billing/plans` response supplies prices, features
and the offer deadline. Use a new Hobby organization with no provider checkout
history, sign in as its owner, choose a paid tier on the landing page and explicitly
confirm the trial. The billing page should show its exact end date, ₹0 and no
automatic charge. No Razorpay credentials or card are needed to claim.

The lifecycle worker reconciles expiry; subscription reads also expire trials on
demand. The isolated API integration tests cover concurrent/repeated claims,
authorization, the IST deadline, expiry with resource freezing, and preservation of
a later paid activation. Never backdate or truncate the development database to
exercise expiry. See [ADR 0004](../adr/0004-early-bird-trials.md) for eligibility and
deployment ordering.
