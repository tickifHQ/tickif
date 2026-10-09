# Tickif UI refresh handoff and checklist

Refresh the shared system and every web UI from the
[new Figma designer profile](https://www.figma.com/design/WJhOguDptAwt2735BS2WMG/tickif--DS-?node-id=15885-4108&m=dev).
Apply it to the profile first, then remaining designer views, visitor/public
views, and admin views. Preserve data contracts and product behavior.

## Current handoff — 9 October 2026

The user now explicitly requests a phase 2 PR and a thorough publishing, editor,
and signed-in CTA audit. This supersedes the earlier phase 2 publication gates
recorded below. See [the publishing audit](./portfolio-publishing-audit.md) for
findings, fixes and browser evidence. Keep the phase PR stacked on
`codex/ui-refresh/foundations`; no merge is authorized.

The user reviewed the component gallery and explicitly confirmed publication:
**"great raise this PR and start working on the next phase"** on 7 October 2026.
The shared foundation is approved for publication through the single phase PR.
The final full workspace test run passed; publication is approved.
Phase 2 is the designer profile; branch it from this phase for the incremental stack.

- Branch: `codex/ui-refresh/foundations`.
- Published phase 1 head: `98a5fec1a0df393b24b5f6d3827b330dbaa9da6b`.
  Implementation commit: `5e31fb7a`; coverage registration fix: `98a5fec1`.
  #710 is open and ready for review. Its first run passed the main verification,
  security and image checks and all 137 browser tests. The post-run coverage
  assertion failed because seven new shared-UI tests were missing from its
  manifest; this is now fixed without relaxing the assertion. Ten coverage unit
  tests pass and the corrected validator accepts the saved 137-pass CI report.
  The rerun is now green for head `98a5fec1`: all verification, critical E2E,
  security and image checks passed; the deployment job was skipped as expected.
  The watcher reports `ready`, with no unresolved review threads. No merge or
  auto-merge was requested; retain the stack's single final merge intention.
- Current main incorporated: `43723979` (#712 engineering documentation
  reorganization, including #709 billing changes). Merge commit: `faaf031`.
- [#710](https://github.com/tickifHQ/tickif/pull/710) is the single shared-foundation
  phase PR. Reuse it for the approved implementation; do not open a duplicate.
- Duplicate aggregate [#711](https://github.com/tickifHQ/tickif/pull/711) is closed.
  Its duplicate branch is not the delivery target. No new aggregate PR should be
  opened alongside the current phase PR.
- Review surface: `/design-system`, task preview at
  [localhost:3020/design-system](http://localhost:3020/design-system).
- [Component review guide](./shared-ui-review.md): all 35 components and behavior.
- [Figma specification](../architecture/ui-refresh/README.md): provenance,
  inferred values, exact assets, caller inventory and remaining extraction.

The latest delivery instruction supersedes the earlier duplicate aggregate
setup: **one PR for this entire shared UI phase**. Later work can form a stack
of incremental phase PRs; do not create a second PR with the same commits.
The original single final merge intention remains, but no merge is authorized.

## Working conventions

Read root `AGENTS.md`, `docs/README.md`, architecture overview and ADR index.
Always apply `docs/coding-guidelines/golden-rules.md` and `security.md`; load
frontend, TypeScript, validation, testing and monorepo rules when relevant.
Current main moved old `rules/` and root documents into the new docs structure.

Read `.agents/skills/reui/SKILL.md` for ReUI work. Reuse installed components,
read real APIs/examples through ReUI MCP, and validate props/audit before done.
Use `pnpm dlx shadcn@latest` from `apps/web` only for missing primitives; aliases
already point into `@repo/ui`. The select feedback required the missing shadcn
Select primitive. See `packages/ui/README.md` for its registry provenance and
the Windows alias-resolution workaround; no component was written outside the repo.

Generic components belong in `packages/ui`; app-specific compositions belong
in `apps/web/src/components`. Theme values belong in the theme file and are
bridged in `globals.css`. Preserve public APIs, native form behavior, Radix
keyboard/focus/dismissal, auth/role gates, billing logic and portfolio accents.
Keep generated captures/reports outside committed source.

## Phase 1 — shared design system

- [x] Incorporate fresh main and its billing/documentation refactoring.
- [x] Read repository ReUI skill, live APIs/examples, audit and validate usage.
- [x] Apply green/warm neutral light theme and inferred mint/deep-green dark theme.
- [x] Bridge display/section typography, soft/inverse surfaces, control/card/feature
      radii, overlay, rating, hover and shadow roles.
- [x] Update buttons, badges, cards, forms, overlays, tabs, tables and pagination.
- [x] Preserve installed ReUI Rating/Icon Stack composition and use semantic colors.
- [x] Add presentation-only RecognitionBadge and six exact crown exports.
- [x] Preserve validated custom accents, readable foreground, scoped hover/ring/shadow.
- [x] Expand `/design-system` with working demonstrations of all 35 components.
- [x] Add regression coverage for custom accent hover/focus, keyboard tabs and
      theme switching without submitting an enclosing form.
- [x] Align docs with current main's architecture/guides/package ownership.
- [x] Complete current final validation and record outcomes below.
- [x] Receive explicit user confirmation after component review.
- [x] Commit/push the implementation and update existing #710 as the single
      phase PR with actual scope, validation and review evidence.

## Phase 2 — designer profile

Started locally on `codex/ui-refresh/designer-profile`, based on phase 1 head
`98a5fec1` (fast-forwarded after the phase 1 manifest repair). Its eventual PR
must target `codex/ui-refresh/foundations` so the
diff is incremental. Phase 2 publication was explicitly authorized on 9 October;
the publishing audit is complete and the full workspace gate is running before
marking the phase PR ready.

Initial implementation replaces the hero proof strip with the reference's
rating/project/founding/budget grid, adds a responsive identity card using the
real portfolio cover and project imagery, and replaces legacy award images
with shared crowns and live captions. API eligibility, New on Tickif, hidden
ratings/recognition, KYC, canonical sharing and enquiry login gates remain intact.
The live page now includes the refreshed hero/card, navigation, numbered sections, landscape project cards, testimonial/ratings layouts, sharing panel, enquiry section, footer and floating enquiry control. Supported static assets are integrated without changing their export bytes.

The user clarified on 8 October: **"I dont want preview, I want real updates in
live pages."** The example profile component and the `/design-system?view=profile`
branch have been removed. Implement and review directly through the existing
`/d/[slug]` page, using its real API payload and production actions. The shared
component inventory remains at `/design-system`.

The reported Next.js error reproduced when the old example card opened
`/image/33333333-3333-4333-8333-333333333333` while no API was running. Do not
reintroduce fixture IDs into live navigation or substitute preview dialogs for
real project, like, or enquiry behavior.

Local API configuration is now present in the gitignored `.env`; the real API
uses port 8008 and the web app uses 3020. Existing local data was copied into
`tickif_ui_refresh_dev` and upgraded with committed migrations, leaving the
original development database intact. For the user's live-profile review request
on 8 October, the existing repository development designer **Studio Meraki** was
completed through the portfolio service: signed logo/cover uploads and a saved
tagline, with ownership, upload and publication checks intact. It is now available
at [localhost:3020/d/studio-meraki](http://localhost:3020/d/studio-meraki) through
the normal route and API. This is development data in the actual application;
there is no separate profile preview route or mocked browser API. Other copied
profiles remain unchanged. MinIO credentials were corrected in the gitignored
local configuration. API and web now run as hidden background processes so the
review page remains available after the chat turn.

- Initial focused validation: 51 profile tests pass, including two failing
  reproductions before implementation for proof data and live crown captions.
  Web typecheck and focused lint pass. Browser checks at 1512/768/390px pass:
  no overflow or page/console errors, all five supported artwork slots load,
  enquiry opens/dismisses sign-in, and missing fields/long names render safely.
  Browser API responses were stubbed for the isolated example-data review.
  Those checks used the now-removed example surface and do not prove live page
  behavior. After removing it, root typecheck/lint and 64 profile, gallery and
  enquiry tests pass. Initial phase 2 changes remain local and uncommitted.
- Live-route validation on 8 October: the API health endpoint reports ready with
  Postgres up. The API-backed `/designers` page loads and its sign-in dialog
  opens/dismisses without console errors; local search schemas were bootstrapped
  on the isolated Typesense service at 8112. `/d/shikhar-studio` returns a real
  404 without a runtime overlay because its required logo is absent. Seventeen
  public profile routing/metadata and API-client tests also pass. These checks
  preceded the working Studio Meraki review profile. No backend publication or
  eligibility logic was changed.
- Published-profile review: Studio Meraki's public API responds 200 with its two
  published projects and earned Established badge. The live in-app browser shows
  the new hero/proof grid, cover/identity card and recognition section. All nine
  images load, console error/warning logs are empty, and Enquire opens the real
  sign-in dialog. The published image-detail API also responds 200. The review
  tab is retained for the user. Further fidelity work is recorded below; phase 2 remains local for live review.
- Fresh high-fidelity contexts for all eleven desktop and mobile sections were
  retrieved again through Figma MCP on 8 October. The real profile composition
  now uses those measurements and static decorations.
- The Google API provides an aggregate and recent reviews without a histogram.
  Tickif reviews retain their existing real histogram, pagination and write/edit
  flow. Centre data supplies addresses/phone/maps links without hours/photos/
  coordinates/centre ratings. Designer-like count, acceptance status and response
  SLA are absent. Do not invent these values or unsupported awards.
- New on Tickif currently reuses the exact established laurel silhouette with
  its own live caption and 90-day criterion. This presentation is inferred;
  dedicated New artwork is absent from the new Figma reference.

- [x] Obtain fresh high-fidelity footer/mobile context, screenshots, compact
      variable/component-origin audit and motion context through Figma MCP.
- [x] Check Code Connect: unavailable on this Figma plan. The desktop subtree has
      no instances or variable bindings; reuse the repository's shared components.
- [x] Compose hero, recognition, selected projects, testimonial/ratings, experience
      centres, sharing, consultation, footer, navigation and floating enquiry.
- [x] Wire existing profile/project/review/centre data and existing actions.
- [x] Preserve studio details and Tickif reviews absent from the reference frame.
- [x] Map supported earned badges through the shared presentation mapping.
- [x] Preserve New on Tickif's existing 90-day eligibility and live label.
- [x] Do not award Client Favourite/Fast Reply without supported eligibility data.
- [x] Keep studio/project photographs dynamic; integrate exact static assets.
- [ ] Verify desktop/mobile geometry, wrapping, long content and empty states.
- [ ] Verify enquiry/share/location links, accessibility and reduced motion.

### Fidelity review follow-up — 8 October 2026

- [x] Apply the Figma name treatment, proof grid, card photo masks, seal layers,
      project geometry, sharing/CTA gradients, navigation and footer to /d/[slug].
- [x] Keep hero seals data-driven; reproduce supported letter positions from MCP.
- [x] Use Helvetica Neue/Helvetica/Arial for display text. The user accepted this
      fallback; exact licensed Helvetica Neue webfont remains unavailable.
- [x] Add regressions for live section anchors, conditional navigation and earned
      seals, plus the floating enquiry's visibility and cleanup.
- [x] Root typecheck and lint pass; focused profile/enquiry/gallery tests: 67 pass.
- [x] Record final current root test result: all 17 tasks passed; web 1,733 tests,
      API 1,943 tests (four intentional skips). See `profile-root-tests-corrected.log`.
- [ ] Complete user live review before pushing/opening a phase 2 PR.
- [x] Recover circular text path 15888:6643 through read-only use_figma after
      get_design_context reported unsupported node type. Preserve its exact
      curve and typography, with real counts/year/location and gated ratings/KYC.
- [ ] Reproduce geographic centre composition when real coordinates/centre media
      and opening hours are supported; official Google Maps embeds now accompany
      supported address/contact/map links.
- [ ] Run build and critical E2E journeys before phase publication/merge.

Current review evidence:

- The real Studio Meraki page is retained and visible at
  `http://localhost:3020/d/studio-meraki`. Its hero/card, earned crown,
  landscape projects, sharing panel, enquiry section and footer use the new
  compositions. Review/testimonial/centre sections remain data-driven; the local
  demo is now populated as recorded below.
- Real browser checks: canonical link copied correctly, Enquire opened and
  dismissed the existing sign-in flow, project navigation loaded the actual
  image-detail page, hero images loaded, mobile and desktop layouts had no
  horizontal overflow, and a fresh page produced no console warnings/errors.
- Latest card review typecheck: 17 tasks passed (`profile-card-typecheck.log`).
  Lint: 16 tasks passed (`profile-card-lint.log`), retaining existing API warnings.
- Latest card production build passed (`profile-card-build.log`). The preceding
  root production build had three tasks pass (`profile-build-reviewed.log`).
  Turbo emitted a Windows standalone-cache symlink warning for `has-flag`;
  compilation and build completed successfully. Verify CI packaging before release.
- Full web suite: 178 files / 1,733 tests passed in the final root run.
  The subsequent ticket-visibility regression reproduced before the fix;
  latest focused profile/floating/project-card suite: 68 tests passed, including
  all 55 profile tests (`profile-ticket-red.log`, `profile-card-tests-reviewed.log`).
- Top-card correction after user feedback: fresh Figma context 15885:2576,
  desktop card 406 × 536 px and mobile minimum height 540 px. Photo arch radii
  now match 107.32 px desktop / 94.5 px mobile; the upper cutout uses the source
  pill geometry. Studio metadata, stamp-specific rotation/opacity, foil surface
  gradients and footer-ticket dimensions were corrected. Dynamic proof text is
  split across both sides of the source curve, with overflow visible so letters
  at the right edge are retained. No additional credentials or reviews were added.
  Browser measurements at 390 px CSS width found no horizontal overflow.
- Exact asset/runtime-copy integrity passes: 53 exports, 63 specification tokens,
  35 shared component files and 82 route/state files. This is integrity evidence,
  separate from the rendered browser review.
- Browser screenshots are outside the repository in the task's visualization
  directory: `profile-main-card-desktop.png` and `profile-main-card-mobile.png`.
- The preceding full run passed all API integration tests but failed four URL
  assertions because the live `.env` uses port 3020. The server URL variable is
  `PUBLIC_WEB_URL`, separate from `NEXT_PUBLIC_WEB_URL`. A focused retry with
  `PUBLIC_WEB_URL=http://localhost:3000` passed all 101 tests in those two files
  (`profile-api-origin-corrected.log`). The full rerun passed, using
  `pnpm test --env-mode=loose` to pass this shell override through Turbo without
  altering the live `.env` (`profile-root-tests-corrected.log`). All 17 tasks
  passed in 22m38s; API 135 files / 1,943 tests passed, with one file / four tests
  intentionally skipped. User review and critical E2E remain before publication;
  review changes remain local.
  Critical E2E journeys remain required before merging phase 2.

### Populated live profile review — 8 October 2026

- [x] Populate the existing Studio Meraki development profile through its real
      portfolio service and database records: featured testimonial, 12 published
      Tickif demo reviews, 4.8 Google aggregate with five demo reviews, and two
      Bengaluru experience centres. The office count is two.
- [x] Label the profile, testimonial, reviewer identities and review bodies as
      demo content. Google data is a local cache fixture, not a fetched or
      verified business listing. No KYC or verified consultation was fabricated.
- [x] Obtain official Google Maps Share embeds for HSR Layout and Whitefield.
      These show neighbourhoods rather than invented precise studio addresses.
- [x] Add reusable `@repo/ui/components/google-map-embed` and integrate it into
      real centre cards, preserving ordinary Maps links and navigation links.
- [x] Verify both interactive maps load in the live browser and the Tickif
      histogram, review pagination, rating summaries and testimonial appear.
- [x] Reproduce the dual-rating summary's mobile overflow before correcting its
      wrapping and wreath sizing. A 320px check also exposed review navigation
      overflow; pagination controls now wrap. Browser width checks pass at
      320px and approximately 390px; page two contains the final two demo reviews.
- [x] Confirm review writing opens and dismisses the existing sign-in dialog.
- [x] Add `public-profile-ratings-mobile.spec.ts` to retain the dual-source mobile
      regression in the isolated E2E suite; execute it before phase publication.
- [x] Test iframe markup and URL validation without mounting network-loading
      iframes in unit tests. Third-party rendering is checked in the browser.
- [x] Focused tests: 10 map URL/markup and 56 profile tests passed, without external
      iframe requests (`studio-map-tests-static.log`, `studio-profile-tests-static.log`).
- [x] Production web build passes, including the final mobile artwork correction
      (`studio-filled-final-build.log`).
- [x] Final root typecheck: 17 tasks; final lint: 16 tasks, with existing API
      warnings (`studio-filled-final-typecheck.log`, `studio-filled-final-root-lint.log`).
- [x] Full web suite: 178 files / 1,734 tests. Shared UI: 16 files / 65 tests.
      Worker: 44 files / 225 tests. API: 135 files / 1,943 tests, with one file /
      four intentional skips. Root: all 17 tasks passed in 26m12s, with no cached
      test results (`studio-filled-root-tests.log`).
- [x] Record final checks for this additional population/map update.
- [ ] Complete the user's live review before phase 2 publication.

Local fixtures and the before-state backup are ignored under `.ui-refresh.local/`:
`populate-studio-details.mts`, `studio-extra-fixtures.sql`,
`studio-map-fixtures.json` and `studio-details-before.json`. Both mutation paths
guard the exact local `tickif_ui_refresh_dev` database; the original database
is untouched. The dummy Google place ID must not be used as a real connection.
Sample accounts use reserved `example.invalid` addresses and have no credentials.
These records are local review data and are excluded from the PR.

Screenshots in the task's visualization directory: `profile-filled-centres.png`,
`profile-filled-ratings.png`, `profile-filled-testimonial.png` and
`profile-filled-hero.png`.

### Bounded sections and location fidelity — 8 October 2026

This records the first correction pass. The Google/source-tab and Studio
decisions below are superseded by the follow-up correction pass after it.

- [x] Retrieve fresh desktop project, testimonial, rating and centre contexts,
      plus mobile project/testimonial/rating/centre contexts through Figma MCP.
- [x] Keep projects bounded to six cards per displayed page. Previous/next
      navigation reaches loaded and subsequent API pages; sorting/filtering
      reset to the first page. Failed fetches retain visible projects and retry.
- [x] Replace the duplicate review lists with one Client ratings section and
      Google/Tickif source tabs. Show at most two cards per source page. Public
      Tickif API pagination also requests two items; `reviewsPage` stays usable.
- [x] Preserve review writing, private status, editing, moderation refresh,
      pagination correction and sign-in. Switching sources preserves Tickif
      drafts and the current Tickif page. Source counts remain separate.
- [x] Match the testimonial's 880px width, 32px desktop/22px mobile type,
      32px author avatar and corner marks. Add exact avatar colours and the
      rating summary/review radii as semantic tokens with Figma provenance.
- [x] Match the ratings summary's wreath/distribution layout and the two
      review cards. Only Tickif has an authoritative histogram; Google shows
      its aggregate and paged recent cache reviews without inventing a histogram.
- [x] Replace separate centre cards with one selected map and a 400px details
      panel, stacked on narrow screens. Centre tabs update the real Google
      embed, address, phone and Maps link together. Overview/About tabs work.
- [x] Reuse the unchanged Figma address-pin SVG. Use real portfolio imagery
      with a "Studio portfolio" caption; do not claim centre-specific photos,
      hours, ratings, sizes or coordinates absent from the contract.
- [x] Replace aggregate "verified reviews" copy with "Tickif reviews"; only
      completed consultations receive the existing verified-client marker.
- [x] Reproduce the unbounded project/review and separate-centre-card bugs in
      failing tests before implementation. Focused checks passed after fixes.
- [x] Final focused checks: 78 tests across profile, project gallery and review
      suites (`section-correction-focused-final.log`). Typecheck and lint pass;
      production web build passes. Specification integrity: 53 assets, 67 tokens,
      36 shared component files and 82 route/state files.
- [x] Register the mobile profile regression in the critical E2E coverage gate;
      all 11 coverage gate unit tests and E2E typecheck pass. Browser E2E execution
      remains outstanding; unit coverage validation does not execute the journeys.
- [x] Live browser checks confirm two visible reviews, paged Google/Tickif data,
      no overflow at narrow widths, one selected map, keyboard centre switching
      and Overview/About panels. Temporary viewport overrides were reset.
- [x] Production web build passes (`section-correction-build.log`); root
      typecheck passes 17 tasks and lint passes 16 tasks with five existing API
      warnings (`section-correction-root-{typecheck,lint}-final.log`).
- [x] Save current mobile review/location evidence as
      `profile-corrected-ratings-current.png` and
      `profile-corrected-centres-current.png` in the task visualization directory.
      Final desktop captures are `profile-corrected-centres-desktop-final.png`
      and `profile-corrected-ratings-desktop-final.png`. At 1412px, the centre
      card measures 660px high with a 400px details panel and no overflow.
- [x] Complete root test run: 17/17 tasks successful in 46m33.587s. API: 1,943
      passed / four skipped; web: 1,737 passed; UI: 65 passed; worker: 225 passed.
      This baseline predates the follow-up frontend corrections below.
- [ ] Execute the updated isolated E2E regressions before phase publication.
- [ ] Complete user live review before pushing or opening the phase 2 PR.

Google Maps retains Google's own map styling and controls. The layout matches
the Figma centre composition; the sample Chennai illustration is still excluded
from unrelated live addresses. Local Studio Meraki fixtures remain demo data.

Runtime verification note: the first root test run hit a 30s timeout in the
unchanged API draft-image deletion test. MinIO health timed out through
`localhost:9000` but responded over `127.0.0.1:9000` (150ms; Node with IPv4-first
DNS returned 200 in 25ms). That failed run was stopped; the fresh root run uses
`NODE_OPTIONS=--dns-result-order=ipv4first` with the existing isolated test
databases, Redis and Typesense (`section-correction-root-tests-ipv4.log`).
Automatic approval review rejected restarting the live API, reporting only
"blocked by policy". Its existing process remains running; API source and the
live `.env` were not changed. The IPv4-first retry completed successfully.

### Follow-up Figma correction pass — 8 October 2026

- [x] Re-read desktop/mobile rating and centre Figma contexts and centre motion
      context through MCP. Added unchanged active/inactive centre pin SVGs and
      the control shadow token (68 tokens; 53 static assets).
- [x] Remove the extra Studio section and its navigation entries. Remove the
      hero secondary Share action: backend supports project saving/likes only.
      Keep the source share card and footer social links.
- [x] Make Client ratings Google-only. Use the shared Carousel with two reviews
      per slide and shared numbered Pagination; arrow and number state sync.
      Projects retain their six-item cap and now use shared Pagination too.
- [x] Match the Google summary's wreath, count, supporting percentage and
      distribution layout. Distribution uses only cached reviews, explicitly
      labelled when its sample is smaller than the aggregate. No invented totals.
- [x] Preserve existing Tickif review entry through booking links and old
      #tickif-reviews deep links, including pagination and sign-in return URLs.
      Normal profile visits render only the Google client ratings section.
- [x] Float the 34px location controls over the map, using Figma's exact pin
      assets, colours, spacing and shadow; use neighbourhood names when centre
      cities repeat. Selected centre updates map/address/details together.
      Mobile map height is 400px, desktop details panel width is 400px.
- [x] Regression-first checks reproduced the reported extras and incorrect
      controls. Focused corrected profile/gallery/review/legacy-link suites:
      83 tests passed. The route test mocks the independently tested client leaf.
- [x] Production web build passes. Live desktop review arrows/numbered pages
      and centre switching verified; 320px/390px widths fit without horizontal
      overflow. Final frontend gate results are recorded below.
- [x] Root typecheck: 17 tasks passed; lint: 16 tasks passed. Specification
      integrity passes (53 assets, 68 tokens, 36 shared files, 82 route/state files).
- [x] Live legacy review hash redirected to review=tickif and showed community
      reviews. Returning to the default profile removed that section. Browser
      error log was empty; temporary viewport overrides were reset.
- [x] Review evidence: profile-round2-reviews.png and profile-round2-centres.png
      in the task visualization directory.
- [x] Final affected run: UI 65 tests and E2E coverage-gate unit tests pass.
      Web: 1,740 passed; two unchanged onboarding/upload tests exceeded 5s.
      Both files pass on an isolated single-worker retry (110/110 tests,
      52.76s). All 1,742 web tests have passed across the run and retry;
      the broad run itself exited nonzero. No test timeout was increased.
      Logs: figma-review-round2-tests-final.log and
      figma-review-round2-timeout-retry.log under the ignored local directory.
- [ ] Execute isolated browser E2E regressions before phase publication.
- [ ] Obtain user visual approval before pushing or raising the phase 2 PR.

### HTML motion pass — 8 October 2026

- [x] Decode the supplied HTML template and study its actual CSS and React
      behavior; record source hash, timing and adaptations in the specification.
- [x] Apply reveal/stagger, numeric counts, seal rotation, pointer tilt/light,
      stamp/wreath entrances, image/recognition/share hover, centre transitions
      and enquiry dock entrance/exit to the real profile.
- [x] Preserve server output, keyboard access and actual review/project/enquiry
      actions. Reduced motion, touch pointers, unmount cleanup and background
      tabs have explicit handling. No animation library or demo data was added.
- [x] Initial targeted checks: 66 tests passed across motion, floating enquiry
      and profile behavior. Root typecheck (17 tasks) and lint (16 tasks) pass.
- [x] Production web build passes. Browser checks confirm centred rotation,
      pointer tilt/reset, no horizontal overflow at 1412px/390px, offscreen
      pause, working carousel pagination and floating enquiry. Error log empty;
      viewport reset. Hero proof: profile-motion-hero.png in the task directory.
- [x] Final affected run: 1,742 web tests passed; five tests in unchanged
      onboarding/upload files exceeded 5s under broad-run load. Both files pass
      in an isolated single-worker retry (110/110, 57.21s). Thus all 1,747 web
      tests passed across the run/retry; the broad command itself exited nonzero.
      UI 65 tests and coverage-gate unit tests pass. No timeout was increased.
      Logs: profile-motion-tests.log and profile-motion-timeout-retry.log.
      Earlier complete backend/workspace baseline remains recorded above;
      isolated browser E2E execution is still required before publication.
- [ ] User visual approval remains required before phase 2 publication.

## Phase 3 — remaining designer views

- [ ] Capture role baselines with appropriate fixtures/session access.
- [ ] Inventory dashboard, projects/list/edit/new/detail, profile/studio/settings,
      enquiries/bookings, billing/verification and all nested designer routes.
- [ ] Migrate page-specific overrides/compositions onto shared tokens/components.
- [ ] Preserve current main's plan selection and checkout return behavior.
- [ ] Verify loading, empty, validation, disabled, success and error states.
- [ ] Verify critical designer journeys and responsive light/dark layouts.

## Phase 4 — visitor and public views

- [ ] Inventory discovery/search, designers, projects, visitor profile/settings,
      saved content, enquiries/bookings, authentication and shared public routes.
- [ ] Apply the new system to page-specific structures and shared shells.
- [ ] Preserve search/filter/pagination, public visibility, auth and sharing rules.
- [ ] Verify critical visitor journeys and all responsive/state variants.

## Phase 5 — admin views

- [ ] Inventory all admin routes, moderation/review/verification, users, projects,
      taxonomy, operational controls and shared table/detail shells.
- [ ] Apply the new system while retaining compact controls and dense tables.
- [ ] Preserve permissions, selection/bulk actions, confirmations and filters.
- [ ] Verify admin journeys, responsive behavior and every data/action state.

## Phase 6 — application verification and delivery

- [ ] Re-audit all component callers and page overrides against the current stack.
- [ ] Resolve remaining visual discrepancies and accessibility/contrast issues.
- [ ] Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` before pushing.
- [ ] Run relevant critical `pnpm test:e2e` journeys before merging user-facing flows.
- [ ] Keep each phase diff incremental; record dependency/base/head SHA and CI.
- [ ] Final merge remains a separate user-authorized action. Do not independently
      merge intermediate phase PRs contrary to the single final merge intention.

## Design decisions and remaining extraction

| Topic                       | Current position                                                                                                                                                                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Figma IDs                   | File `WJhOguDptAwt2735BS2WMG`, section `15885:4108`, desktop `15885:2549` (1512px), mobile `15885:4109` (390px).                                                                                                                               |
| Heading font                | Helvetica Neue Medium is in Figma; Helvetica Neue/Helvetica/Arial system stack is approved until a licensed webfont is supplied.                                                                                                               |
| Dark mode / absent controls | Inferred styles, demonstrated in the gallery; not claimed as exact Figma specifications.                                                                                                                                                       |
| Recognition                 | Exact artwork, live labels; generic component has no awarding logic. Client Favourite/Fast Reply remain unsupported domain awards.                                                                                                             |
| Figma access                | Primary MCP access restored. Fresh desktop/mobile section contexts, footer, screenshots, motion and component/variable audit retrieved on 7 October. The mobile frame itself has 1% opacity; do not reproduce that opacity in the application. |
| Motion                      | Fresh context confirms the 2.2s map-marker pulse (`15885:3736`). Preserve its supplied timing if the map is implemented; shared controls support reduced motion.                                                                               |
| Asset integrity             | 53 static exports and 10 dynamic photo slots recorded. Six recognition SVGs now live in the app's public folder, with original SHA-256 hashes preserved.                                                                                       |

## Validation log

- Earlier extraction-only checks passed but do not establish current runtime readiness.
- Final `pnpm typecheck`: passed, 17 tasks.
- Final `pnpm lint`: passed, 16 tasks; five existing API warnings.
- Final reviewed `pnpm build`: passed, 3 tasks, including recognition geometry
  and reduced-motion fixes (3m06s; `.ui-refresh.local/build-review-final.log`).
- Final shared package tests: 15 files / 51 tests passed. Accent tests:
  2 files / 22 tests passed. Designer-lead tests: 9 tests passed after updating
  the old 40px assertion to the new 44px default button.
- Before the select feedback, the full-run web result was 177 files / 1,724 tests passed. Worker: 44 files /
  225 tests passed. API integration execution finished: 1,939 passed, 4 failed,
  4 skipped. Projects/project-likes reported Postgres pool connection timeouts;
  taxonomy failed its truncate hook at 30s; profiles received a 500 from the
  team/roles endpoint. The workspace suite is not green yet; these remain a
  verification failures from the earlier environment. All four pass on focused
  retry using `127.0.0.1` for the isolated services. The final canonical full
  rerun passes: 17 tasks; API 1,943 passed / 4 opt-in connectivity tests skipped.
- Initial current full test run: one unrelated Resend SDK test timed out at 5s
  while the build was running. No assertion failure in changed UI code.
- The first retry passed 1,723 of 1,724 web tests; its sole failure was the old
  button-height assertion, now corrected and verified. A full-suite rerun with
  `pnpm test --continue=always` finished with 16 successful tasks and the API
  task failed (`.ui-refresh.local/full-test-final.log`).
- Rendered validation passed in Chromium at 1512px, 768px and 390px: all gallery
  interactions, theme switching, custom accents, reduced motion, no horizontal
  overflow and no page/console errors. Browser plugin is unavailable; the
  installed Playwright runtime was used.
- Browser-resolved contrast checks passed for 36 light/dark pairs: minimum 5.29:1
  for tested normal text pairs and 3.20:1 for input boundaries/custom rings.
- Three committed Playwright regressions passed against the running preview:
  form reset, pointer month clearing/reselection, and reduced-motion overlay
  focus/dismissal. Reproduce through `e2e/tests/shared-ui.spec.ts` in the ordinary
  E2E harness; this task used an external config pointed at port 3020.
- Specification integrity passed: 53 exports, 46 proposal tokens, 34 shared
  component files and 82 route/state files. Exact SVG hashes are preserved.
- Isolated services: test DBs `tickif_ui_refresh_test` and
  `tickif_ui_refresh_worker_test`, Redis port 6382/DB 15, patched local Typesense
  port 8111 with a task-specific collection prefix. Avoid shared development DBs.
- Browser evidence is outside the repo under the task's visualization directory.
  Review component interactions, viewport checks and console health before approval.

## Component review feedback

- [x] Fix loaded-font scope: Inter/JetBrains Mono were declared on `<body>`
      while theme variables resolved on `<html>`, causing Segoe UI fallback.
      Browser font inspection now confirms Inter is actually rendered.
- [x] Normalize button/badge label leading and centered spacing across sizes;
      keep existing control heights and API overrides.
- [x] Remove simultaneous native month popup; retain manual YYYY-MM editing,
      native pattern validation, custom selection, clear and Escape dismissal.
- [x] Verify feedback fixes with 55 UI tests and seven Playwright regressions,
      including the failing font-scope/month-type reproductions before fixes.
- [x] Recheck responsive gallery at 1512/768/390px with no overflow or console errors.
- [x] Feedback typecheck and lint pass; logs `.ui-refresh.local/*-feedback.log`.
- [x] Feedback `pnpm build` passes: three tasks, 1m32s;
      `.ui-refresh.local/build-feedback.log`.
- [x] Replace native SelectField UI with the shared shadcn/Radix Select popup,
      preserving controlled values, empty clearing, required/disabled state,
      labels/errors, form submission and existing callers' compact styling.
- [x] Pin Select 2.3.7 to match Dialog's shared focus/dismissal dependencies;
      2.3.8 introduced a nested-focus loop. Nested dialog/browser tests pass.
- [x] Demonstrate optional/disabled options and dialog nesting in the gallery;
      validate light/dark and 390px mobile popups with no overflow or console errors.
- [x] Update existing caller tests to exercise real popup options rather than
      native select events. Project upload, experience centres, team roles,
      reviews, branch controls, consultations, profile editing and admin filters pass.
- [x] Replace the remaining app-level native rows-per-page select with the
      shared primitive. Its popup test verifies filter preservation and reset
      to page 1 when the limit changes (four pagination tests pass).
- [x] Final select-feedback `pnpm typecheck` passes: 17 tasks. `pnpm lint`
      passes: 16 tasks, the same five existing API warnings. `pnpm build`
      passes: three tasks, 3m31s. Logs `.ui-refresh.local/*-select-final.log`
      and `.ui-refresh.local/build-select.log`.
- [x] Final full web result: 177 files / 1,725 tests passed. Command:
      `pnpm --filter @repo/web test --maxWorkers=2 --testTimeout=10000`.
      An input-heavy onboarding test passes in isolation but exceeded the default
      5s limit under concurrent verification; no onboarding code was changed.
      Log: `.ui-refresh.local/web-select-final-tests.log` (9m14s).
- [x] Migrate eight existing E2E journey files from native select events/assertions
      to popup interactions. E2E typecheck passes; the seven shared UI browser
      checks ran successfully. Full backend-dependent journeys were not rerun;
      run them before merging the later application phases.
- [x] User design confirmation received; phase publication authorized.

- Final canonical `pnpm test` rerun uses explicit IPv4 for the isolated Postgres,
  Redis and Typesense services. Web: 177 files / 1,725 tests passed at its default
  timeout. Worker: 44 files / 225 tests passed. UI: 15 files / 55 tests passed.
  API: 135 files passed / one opt-in connectivity file skipped; 1,943 tests
  passed / four skipped. Root: all 17 tasks passed in 22m24s, with no cached
  results (`.ui-refresh.local/phase1-publication-full-test.log`). No backend
  source was changed. This verifies the phase 1 snapshot; initial profile
  changes are separate unstaged phase 2 work.

## Resume checklist

- [ ] Keep phase 2 changes on the profile branch. Phase 1 is already published;
      do not mix further profile work into #710 or open a duplicate shared PR.
- [ ] Inspect Git status; preserve local implementation and any user changes.
- [ ] Read latest user instructions and this handoff before acting on PRs.
- [ ] Keep the shared phase separate from the profile phase; preserve the single-final-merge intention.
- [ ] Check currently running verification before restarting expensive suites.
- [ ] Continue from the first incomplete checklist item; preserve completed work.
- [ ] Record check outcomes, exact next action and changed head when handing off.

### Publishing audit — 9 October 2026

- [x] User explicitly requested the phase PR and configuration/publishing audit.
- [x] Verify real owner and visitor workflows; see [audit matrix](./portfolio-publishing-audit.md).
- [x] Fix independent Google summary visibility and align editor recognition artwork.
- [x] Restore demo configuration and remove the synthetic visitor/enquiry after verification.
- [x] Focused editor/profile suite: 152 tests passed. Workspace typecheck and lint pass; E2E source typecheck and asset verification pass.
- [x] Record fresh root gate accurately: 15/17 tasks completed; web 1,737 passed / 11 failed
      (timeouts and short async waits), plus API canonical URL mismatches from the demo origin.
      All five affected web files pass on retry (186 tests, one worker, unchanged timeout);
      both portfolio API files pass (101 tests) with the fixture's public URL. Worker: 225 passed.
      Initial GitHub typecheck/lint/test/build passes; do not claim a clean local root pass.
- [ ] GitHub CI and review readiness for the phase PR. Keep it unmerged.
- [x] Open draft [PR #713](https://github.com/tickifHQ/tickif/pull/713), stacked on #710.
      Initial head `8d3b168` passes GitHub typecheck/lint/test/build. The security gate
      identified GHSA-cjq9-62q9-8jv4; Next.js 16.3.8 is installed and the patched security gate passes.
- [x] Fix browser-traced motion failures: unavailable observer fallback and a pointer-focus
      reveal jump that swallowed first clicks. Eight motion/floating-enquiry regressions pass.
      Align publication/marketplace assertions with named controls and decorative hero punctuation.
- [x] Final local workspace typecheck (17 tasks), lint (16 tasks), and E2E source typecheck pass.
- [x] Production build passes on Next.js 16.3.8 (three tasks, 1m56s).
- [ ] Restart the local web server to activate Next.js 16.3.8. Automatic approval review
      rejected the verified port-3020 process restart as "blocked by policy"; do not bypass it.
