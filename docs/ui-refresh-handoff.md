# Tickif UI Refresh Handoff and Checklist

Refresh the shared design system and every web UI using the new Figma designer
profile as the visual reference. Complete the designer profile and all designer
views before moving to visitor and public views, then admin views. Preserve
existing product behavior and adapt layouts without Figma references to the new
visual language.

Deliver the work as stacked PRs for phased review, with one aggregate PR merged
into `main` after the complete application refresh is verified. Keep phase PRs
unmerged; their branches supply the commits included in the aggregate PR.

## Current handoff

- Date: 7 October 2026.
- Status: Phase 1 extraction implemented in part; the shared UI refresh has
  not started. The user authorized Phase 1 implementation.
- Next action: finish footer, mobile, variable/component-source, and fresh
  motion extraction when Figma MCP capacity/access is restored. See the
  [Phase 1 specification](./design/ui-refresh/README.md).
- Initial checkout: detached HEAD at
  `fbfbb98a9b20cddf1e9c79da19dbd2f70acf6bbe`. Fetched `origin/main`, created
  `codex/ui-refresh/foundations`, and pulled with `--ff-only`; fresh remote
  baseline is the same SHA. Integration branch starts from that baseline.
- Unchecked boxes are outstanding; inspection of an item does not mean its
  redesign is complete. Runtime components remain unchanged in Phase 1.
- Finish one phase with evidence before starting the next. The initial review
  gates implementation; subsequent phase gates are verification steps, not
  automatic requests for user permission.
- Dependencies installed with `pnpm install --frozen-lockfile`. Typecheck and
  lint passed (lint retains five existing API warnings). All 175 web test files
  passed: 1,700 tests. Full-suite results are recorded in the validation log.

## Design reference and findings

- [Figma portfolio section](https://www.figma.com/design/WJhOguDptAwt2735BS2WMG/tickif--DS-?node-id=15885-4108&m=dev).
- File key: `WJhOguDptAwt2735BS2WMG`; section: `15885:4108`;
  desktop frame: `15885:2549`; page: `14907:2587`.
- Figma MCP inspection established a 1512px desktop frame with a long portfolio
  layout. Fetch current context again when implementing; temporary asset URLs
  from planning may expire.
- Extracted styles include primary green `#1e7a55`, deep green `#0f3326`,
  foreground `#171612`, muted warm text, white and pale green surfaces, pill
  buttons, fine borders, and soft shadows. Raw values belong in theme files.
- Typography: Helvetica Neue headings, Inter body, JetBrains Mono metadata.
  Confirm font files and availability before implementation; record any chosen
  fallback as an inference rather than an exact Figma match.
- Recognition uses crown/laurel artwork. The hero share card also contains
  circular seals; inventory these separately so recognition artwork is placed
  in the correct slots.
- Figma motion exists in the experience-centre section. Retrieve its motion
  context and provide a reduced-motion alternative.
- A 390px mobile frame exists: `15885:4109`. Detailed extraction is pending
  the primary account's MCP quota; the secondary account lacks required access.

### Useful Figma nodes

| Element                                 | Node                       |
| --------------------------------------- | -------------------------- |
| Hero                                    | `15885:2572`               |
| Hero content                            | `15885:2576`               |
| Primary consultation button             | `15885:2653`               |
| Recognition section and artwork row     | `15885:2904`, `15885:2911` |
| Selected projects                       | `15885:3252`               |
| Featured testimonial                    | `15885:3362`               |
| Client ratings                          | `15885:3379`               |
| Experience centres                      | `15885:3518`               |
| Sharing block                           | `15885:3883`               |
| Consultation section                    | `15885:3959`               |
| Footer                                  | `15885:3983`               |
| Navigation and floating enquiry control | `15885:4065`, `15885:4092` |

## Working conventions

- Read `AGENTS.md`, `rules/golden-rules.md`, and `rules/security.md` on resume.
  Load frontend, TypeScript, validation, testing, monorepo, and backend rules
  when their scopes apply.
- Use Figma MCP and the Figma design-to-code skill. Obtain screenshots and
  detailed context for individual sections; sparse metadata is insufficient
  for implementation. Honor applicable Code Connect mappings.
- Reuse and extend `@repo/ui`. Generic components belong in `packages/ui`;
  app-specific compositions belong in `apps/web/src/components`.
- Use semantic tokens. Keep existing token names and component APIs stable
  where possible. Review callers when changing defaults or retiring variants.
- Use pnpm. If a missing primitive requires generation, run
  `pnpm dlx shadcn@latest` from `apps/web` with its existing aliases. Read the
  repository ReUI skill before ReUI work.
- Preserve accessibility, auth and role gates, data contracts, pagination,
  validation, payment behavior, and portfolio customization.
- Keep real studio/project imagery dynamic. Download static Figma assets into
  permanent local files using the supplied tool instructions; do not ship
  temporary Figma URLs or flatten the page screenshot into an asset.
- A phase may be split into small reviewable commits. Update this handoff in
  each completed batch with actual paths, decisions, checks, and next work.

## Stacked PR delivery

Use a branch per reviewable phase or batch. The first phase branch starts from
fresh `main`; each later branch starts from the preceding branch's reviewed tip
and its PR targets that preceding branch. Phase PRs show incremental diffs.

Maintain `codex/ui-refresh/integration` as a stable aggregate branch. Advance it
to the latest stack tip using fast-forward updates so it contains the same
commits without additional merge commits. Open one aggregate draft PR from
this branch to `main` once the first implementation commits exist. Its diff
contains the whole refresh; keep it draft until final validation and review.

The following names are proposed. Record actual names and URLs below when the
PRs are created. Phases 0 and 1 establish the baseline and specification; include
their documentation with the foundations PR rather than creating empty PRs.

| Batch                         | Phases | Proposed branch                 | PR base            |
| ----------------------------- | ------ | ------------------------------- | ------------------ |
| Foundations and shared UI     | 0–2    | `codex/ui-refresh/foundations`  | `main`             |
| Assets and recognition        | 3      | `codex/ui-refresh/assets`       | Foundations branch |
| Public designer profile       | 4      | `codex/ui-refresh/profile`      | Assets branch      |
| Remaining designer views      | 5      | `codex/ui-refresh/designer`     | Profile branch     |
| Visitor and shared views      | 6      | `codex/ui-refresh/visitor`      | Designer branch    |
| Admin views                   | 7      | `codex/ui-refresh/admin`        | Visitor branch     |
| Final verification and fixes  | 8      | `codex/ui-refresh/verification` | Admin branch       |
| Aggregate application refresh | All    | `codex/ui-refresh/integration`  | `main`             |

Large role phases may use several sequential PRs. Insert each batch into the
chain, update downstream bases, and keep the same single final merge policy.

- [ ] Record each phase PR's parent dependency, branch, base, URL, and head SHA.
- [ ] Keep phase PRs draft while incomplete; mark reviewable only after their
      phase gate passes. State that they must not be merged independently.
- [ ] Put scope, screenshots, checks, design decisions, and the aggregate PR
      link in each phase PR description; link the ordered stack from the aggregate.
- [ ] Resolve upstream review changes before continuing dependent work. If
      branches must be rewritten, preserve work, restack descendants in order,
      coordinate published history changes, and use force-with-lease when needed.
- [ ] Propagate updates from `main` through the stack in order and revalidate
      affected phases. Record changed SHAs and stale review evidence.
- [ ] Advance the integration branch to the current stack tip. If history was
      rewritten, reconcile it explicitly; do not overwrite unrelated commits.
- [ ] Run CI on phase PRs and final required checks on the aggregate's current
      head. Do not treat approvals or passing CI on older SHAs as current evidence.
- [ ] After final review, merge only the aggregate PR into `main` once. This
      delivery decision does not itself authorize performing the final merge.
- [ ] Verify the merged result includes the complete stack, then close phase
      PRs as incorporated with links to the aggregate merge. Remove branches only
      after confirming their work is preserved and they are no longer needed.

### Stack tracking

| Batch        | Actual branch                  | Base branch | PR URL  | Head SHA           | Review and CI status             |
| ------------ | ------------------------------ | ----------- | ------- | ------------------ | -------------------------------- |
| Foundations  | `codex/ui-refresh/foundations` | `main`      | Pending | Baseline SHA above | Phase 1 partial; Phase 2 pending |
| Assets       | —                              | —           | —       | —                  | Not created                      |
| Profile      | —                              | —           | —       | —                  | Not created                      |
| Designer     | —                              | —           | —       | —                  | Not created                      |
| Visitor      | —                              | —           | —       | —                  | Not created                      |
| Admin        | —                              | —           | —       | —                  | Not created                      |
| Verification | —                              | —           | —       | —                  | Not created                      |
| Aggregate    | `codex/ui-refresh/integration` | `main`      | Pending | Baseline SHA above | Draft; only final merge target   |

## Phase 0 Review and fresh main baseline

- [x] User has reviewed the plan and authorized implementation.
- [x] Inspect status, branch, local commits, and worktree attachments; preserve
      this handoff and unrelated changes without a destructive reset.
- [x] Fetch and pull fresh `main` in an appropriate checkout, then create a
      foundations branch and the integration branch from the updated baseline.
- [x] Record branch and baseline SHA in the progress log.
- [x] Confirm the stacked PR chain and initialize stack tracking; preserve the
      single aggregate merge policy throughout implementation.
- [x] Re-read rules and reconcile all routes, components, assets, and tests
      against updated `main`. Add routes introduced since this draft.
- [x] Run `pnpm install` after synchronizing the baseline; this initial checkout
      has no installed workspace dependencies.
- [ ] Start the app and establish baseline checks and screenshots for the
      design-system showcase and representative designer, visitor, and admin views.
- [x] Record required local services and any pre-existing failures separately.

Exit: baseline and coverage are reproducible; implementation has a safe branch.

## Phase 1 Extract tokens and resolve design gaps

- [ ] Retrieve current detailed Figma context, screenshots, styles, variables,
      available variants, static assets, and motion for all profile sections.
- [x] Map colors, font roles, type scales, spacing, radii, borders, shadows,
      icon dimensions, and motion into semantic tokens.
- [x] Distinguish measured Figma values from inferred choices, including form
      controls, dense tables, overlay surfaces, dark mode, and responsive behavior.
- [x] Resolve heading font loading and record the chosen source or fallback.
- [x] Inventory every shared component's callers before changing defaults.
- [x] Define hover, active, focus, disabled, error, selected, and loading states.
- [x] Record the badge and data decisions below with supporting source paths.

Completed evidence: 46 proposed tokens; a palette with source nodes; 33 shared
component files and 81 route/state files audited; 53 locally exported static
assets with root dimensions; 10 dynamic photo slots identified. Seven proposed
opaque text/surface pairs pass 4.5:1 contrast. This is a specification check,
not a complete rendered accessibility audit.

Still open: footer/mobile context and screenshots, a compact variable and
component-origin audit, fresh motion context, and representative role baselines.
The first programmatic style response was truncated at 20KB; only its complete
palette/frame prefix was retained. Do not treat it as a complete binding export.

Exit: token mapping and asset inventory are complete; implementation choices
without a direct reference are explicitly documented.

## Phase 2 Refresh the entire shared UI package

Primary files: `packages/ui/src/styles/themes/tickif.css`,
`packages/ui/src/styles/globals.css`, `packages/ui/src/components`,
`packages/ui/README.md`, and `apps/web/app/design-system/page.tsx`.

- [ ] Update theme values, Tailwind bridges, fonts, type scales, and shadows.
- [ ] Buttons: all variants and sizes, text/icon combinations, pill treatment,
      loading, disabled, destructive, focus, and pressed states.
- [ ] Badges and avatars: shapes, sizes, metadata, fallback, and image behavior.
- [ ] Forms: `input`, `textarea`, `label`, `field`, `select-field`,
      `number-input`, `month-picker-field`, `tag-combobox`, and
      `required-field-indicator`.
- [ ] Selection controls: `checkbox`, `switch`, and `slider`.
- [ ] Containers and navigation: `card`, `separator`, `tabs`, `table`, and
      `pagination`.
- [ ] Overlays: `dialog`, `dropdown-menu`, and `tooltip`.
- [ ] Feedback: `alert`, `tip-callout`, `empty-state`, and `skeleton`.
- [ ] Motion and media: `carousel` and `animated-collapsible-content`.
- [ ] Existing ReUI components: `rating` and `icon-stack`.
- [ ] Theme support: `theme-provider`, `mode-toggle`, light and dark modes.
- [ ] Audit utilities, package exports, and any newly discovered components.
- [ ] Expand `/design-system` to show every component and relevant state,
      including controls whose design is inferred.
- [ ] Correct existing app overrides that prevent shared styles from taking
      effect, without prematurely marking the affected page redesigned.
- [ ] Verify representative app consumers after global token/default changes.
- [ ] Update package documentation and complete the phase validation gate.

Exit: every shared component has been reviewed and refreshed or explicitly
recorded as already matching, with visual evidence in the showcase.

## Phase 3 Integrate recognition and static assets

- [ ] Export exact icons, crown/laurel assets, seals, and decorative artwork;
      record each source node, local path, intended slot, and root dimensions.
- [ ] Replace legacy artwork in `apps/web/public/illustrations/badges` and
      update shared presentation mapping where necessary.
- [ ] Keep settings previews and public profile rendering consistent through
      `PORTFOLIO_BADGE_PRESENTATION` in `packages/contracts/src/profiles.ts`.
- [ ] Use reusable UI wrappers where appropriate, keeping contracts free of
      React/UI dependencies.
- [ ] Support dynamic badge text, dates, and project counts without embedding
      the example studio's values into production assets.
- [ ] Verify all static files are non-empty, use local paths, and render in
      their intended positions with correct proportions.
- [ ] Complete the phase validation gate.

### Recognition decision checklist

The current contract supports `verified`, `new`, `top-performer`, `established`,
and `projects-published`. Figma shows Verified Studio, Top Performer, Client
Favourite, Established, 28 Projects, and Fast Reply.

- [ ] Map supported recognition types to the new artwork and presentation.
- [ ] Define how the existing `new` badge fits the new style.
- [ ] Determine whether Client Favourite and Fast Reply have sufficient real
      data and defined eligibility; do not display unsupported achievements.
- [ ] Record whether additions require contracts, API/service logic, or schema
      changes. Handle any required additions as a separate tested batch using the
      applicable rules; document unresolved scope with the user when necessary.
- [ ] Preserve awarding semantics unless a product change is explicitly agreed.

Exit: shared UI and static assets are ready before rebuilding the profile.

## Phase 4 Implement the public designer profile

Entry point: `apps/web/app/(public-profile)/d/[slug]/page.tsx`.
Composition: `apps/web/src/components/public-designer-profile.tsx`.

- [ ] Navigation, trust strip, anchor links, and floating enquiry control.
- [ ] Hero: availability, studio identity, heading, description, statistics,
      consultation action, like behavior, and portfolio card.
- [ ] Recognition row using the new assets and real eligibility.
- [ ] Selected projects with real links, images, metadata, and pagination.
- [ ] Featured testimonial with existing visibility settings.
- [ ] Ratings summary, distribution, Google reviews, and Tickif reviews.
- [ ] Experience centres, locations, map interaction, and detail tabs.
- [ ] Share block, copy-link behavior, and social-card output, including
      `apps/web/app/(public-profile)/d/[slug]/social-card/route.tsx`.
- [ ] Consultation section and profile-specific footer.
- [ ] Account for existing studio details and other data absent from the new
      frame; record their placement or agreed treatment.
- [ ] Preserve canonical redirects, metadata, unpublished-profile behavior,
      accent contrast, section toggles, enquiry availability, and review flows.
- [ ] Test long names, sparse portfolios, missing media/reviews/centres, and
      different badge combinations.
- [ ] Match the 1512px desktop reference; verify tablet, mobile, dark mode,
      keyboard access, motion, and reduced motion.
- [ ] Complete the phase validation gate.

Exit: the profile matches Figma and works with live data and existing settings.

## Phase 5 Refresh all remaining designer views

Complete designer work before visitor and admin page redesigns. Each checked
route includes its forms, dialogs, navigation, loading, error, and empty states.

- [ ] Designer workspace shell, organization/branch switchers, and shared loading.
- [ ] `/designer/select-studio`.
- [ ] `/designer/onboarding` and `/designer/onboarding/deferred`.
- [ ] `/designer/new-organization` and `/designer/manage-membership`.
- [ ] `/designer/dashboard`.
- [ ] `/designer/analytics`, charts, filters, legends, and tooltips.
- [ ] `/designer/profile`, logo upload/crop, and editor validation.
- [ ] `/designer/portfolio`, cover crop, accent settings, and badge previews.
- [ ] `/designer/projects`, row actions, moderation feedback, and pagination.
- [ ] `/designer/projects/new` and `/designer/projects/upload`.
- [ ] `/designer/projects/[id]/edit`.
- [ ] `/designer/leads`, detail dialogs, and status actions.
- [ ] `/designer/consultations`, scheduling and cancellation actions.
- [ ] `/designer/reviews`, editors and review visibility states.
- [ ] `/designer/branches`, branch/team management, and invitations.
- [ ] `/designer/verification`, submission and outcome states.
- [ ] `/designer/terms-roles`, permissions and studio closure flows.
- [ ] `/designer/plan-billing`, payment history, and subscription actions.
- [ ] `/designer/plan-billing/subscribe`, checkout, payment methods, recovery,
      replacement checkout, and success/failure states.
- [ ] Review designer-associated dialogs and components without standalone routes.
- [ ] Complete designer journey checks and the phase validation gate.

Exit: every designer route and nested flow is accounted for and verified.

## Phase 6 Refresh visitor public and shared account views

- [ ] Public, main, and protected shells; site and public headers/footers.
- [ ] `/`, discovery feed, search, filters, cards, and scroll/login gates.
- [ ] `/designers`, designer discovery, filters, results, and pagination.
- [ ] `/projects/[id]`, gallery, overview, story, recommendations, and actions.
- [ ] `/image/[id]`, media view and navigation.
- [ ] `/blog` and `/blog/[slug]`.
- [ ] `/enquiries`, details and enquiry submission dialogs.
- [ ] `/home`, personal dashboard and saved/liked content where implemented.
- [ ] `/home/consultations`, scheduling, cancellations, and review creation.
- [ ] `/home/settings`, identity and account forms.
- [ ] `/home/list-your-work`.
- [ ] `/onboarding`, visitor onboarding and validation states.
- [ ] `/login`, routed login modal, action login dialogs, and OTP states.
- [ ] `/invitations/[id]`, acceptance and invalid/expired states; check both roles.
- [ ] `/unauthorized`, root `not-found`, `error`, and `global-error` views.
- [ ] Audit `@auth` default/catch-all pages and interception behavior; record
      intentionally nonvisual routes as such.
- [ ] Verify shared consultation, review, auth, and enquiry changes against
      already-completed designer views.
- [ ] Complete visitor journey checks and the phase validation gate.

Exit: all visitor/public routes and shared account flows follow the new system.

## Phase 7 Refresh all admin views

- [ ] Admin workspace shell, navigation, role badges, and shared loading/error UI.
- [ ] `/dashboard`, platform summary, charts, and drill-down actions.
- [ ] `/users`, filters, directory, pagination, and available role actions.
- [ ] `/moderation`, project queue, decisions, reasons, and confirmations.
- [ ] `/review-moderation`, review queue and moderation actions.
- [ ] `/verifications`, verification queue, detail views, and decisions.
- [ ] `/admin/enquiries`, filters, details, and management actions.
- [ ] Audit nested menus/dialogs and permitted admin versus superadmin states.
- [ ] Verify dense tables and bulk/action controls remain usable at smaller widths.
- [ ] Preserve authorization, confirmations, and all moderation/business rules.
- [ ] Complete admin journey checks and the phase validation gate.

Exit: all admin routes and role-dependent states are refreshed and verified.

## Phase 8 Verify complete application coverage

- [ ] Reconcile route/component inventory against final source, including any
      pages added to `main` during the rollout.
- [ ] Review light/dark styles, tokens, typography, icon treatment, forms,
      feedback, responsive shells, and overlays across all roles.
- [ ] Confirm remaining old assets/styles are deliberate or remove unused ones.
- [ ] Verify image loading, social-card output, layout shifts, and client/server
      boundaries; investigate performance regressions caused by the refresh.
- [ ] Verify keyboard navigation, focus, labels, contrast, reduced motion,
      touch targets, and zoom behavior.
- [ ] Run `pnpm typecheck`, `pnpm lint`, and `pnpm test` successfully.
- [ ] Run `pnpm test:e2e` for user-facing flows before merging and relevant build
      checks, including the web build.
- [ ] Record final screenshots, command outcomes, remaining limitations, and
      review/PR links where available. Do not mark incomplete work as done.
- [ ] Confirm the integration branch contains every phase, finish aggregate PR
      review and CI on its current head, and prepare the single merge into `main`.

Exit: the whole application passes the agreed coverage and repository checks.

## Validation gate for every implementation phase

Check these before marking a phase complete. A styling change inherited from a
shared token does not by itself complete a page checklist item.

- [ ] Every item is verified, or explicitly recorded as blocked with a reason.
- [ ] Figma-backed sections have browser screenshot comparisons; inferred
      designs and deviations are documented.
- [ ] Relevant responsive widths, light/dark styles, long content, and loading,
      empty, error, disabled, and success states have been exercised.
- [ ] Meaningful interaction tests cover changed behavior; existing tests pass.
      Keep tests behavioral rather than mirroring markup or CSS implementation.
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm test` pass for a completed phase;
      record pre-existing failures separately and do not claim passing checks.
- [ ] Critical changed user journeys receive relevant browser/E2E checks.
- [ ] Shared changes are checked against previously completed views and sampled
      against upcoming roles to detect regressions early.
- [ ] Phase PR base and diff contain the intended batch; dependencies, head SHA,
      review status, CI results, and aggregate branch are current in stack tracking.
- [ ] Update progress, decisions, evidence, and exact next action below.

## Progress log

| Phase                      | Status                                                       | Branch or commit                                                           | Evidence and checks                                                       | Next action                                       |
| -------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------- |
| 0 Review and baseline      | Branch/dependencies ready; role screenshots pending          | `codex/ui-refresh/foundations`; `fbfbb98a9b20cddf1e9c79da19dbd2f70acf6bbe` | Fresh main; typecheck/lint and web tests pass; showcase baseline captured | Capture role baselines with fixtures              |
| 1 Design extraction        | Partial; Figma capacity/access prevents remaining extraction | `codex/ui-refresh/foundations`                                             | [Specification and artifacts](./design/ui-refresh/README.md)              | Footer/mobile, bindings, fresh motion, phase gate |
| 2 Shared UI package        | Not started                                                  | —                                                                          | —                                                                         | After phase 1                                     |
| 3 Assets and recognition   | Not started                                                  | —                                                                          | —                                                                         | After phase 2                                     |
| 4 Public designer profile  | Not started                                                  | —                                                                          | —                                                                         | After phase 3                                     |
| 5 Designer views           | Not started                                                  | —                                                                          | —                                                                         | After phase 4                                     |
| 6 Visitor and shared views | Not started                                                  | —                                                                          | —                                                                         | After phase 5                                     |
| 7 Admin views              | Not started                                                  | —                                                                          | —                                                                         | After phase 6                                     |
| 8 Application verification | Not started                                                  | —                                                                          | —                                                                         | After phase 7                                     |

## Decisions and unresolved work

| Topic                          | Current position                                            | Resolution or evidence                                                                             |
| ------------------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Heading font                   | Helvetica Neue in Figma; no webfont in repository           | Use loaded Inter 500 until approved Helvetica Neue webfont is available; explicit visual deviation |
| Unsupported recognition        | Client Favourite and Fast Reply have no eligibility rule    | Export as reference; do not award/render unsupported achievements                                  |
| Existing New badge             | Preserve current 90-day eligibility                         | Reuse exact purple wreath decoration with live New on Tickif label; inferred presentation          |
| Mobile and tablet              | Mobile frame `15885:4109` discovered                        | Detailed mobile extraction pending MCP capacity/access; tablet composition remains inferred        |
| Dark mode and missing controls | Proposed palette and state recipes recorded                 | Validate inferred styles in Phase 2 showcase; baseline dark heading contrast needs attention       |
| Custom portfolio accents       | Existing product capability                                 | Preserve customization and contrast                                                                |
| Features absent from the frame | Existing profile includes studio details and Tickif reviews | Define placement while preserving functionality                                                    |

Append decisions here with source paths and dates as they are resolved.

Recognition decisions are backed by `packages/contracts/src/profiles.ts` and
`apps/api/src/modules/profiles/portfolio-service.ts`. Preserve existing awarding
rules. Accent behavior is backed by `apps/web/src/lib/portfolio-accent.ts`:
scoped primary foreground, hover, and focus must remain contrast-safe.

### Validation and environment log — 7 October 2026

- `pnpm install --frozen-lockfile`: passed; no dependency/lockfile changes.
- `pnpm typecheck`: passed, 17 tasks.
- `pnpm lint`: passed, 16 tasks; five existing API warnings.
- `pnpm --filter @repo/web test`: passed, 175 files / 1,700 tests.
- `pnpm test`: initial run hit an existing shared test-database enum collision.
  Retried using new task databases `tickif_ui_refresh_test` and
  `tickif_ui_refresh_worker_test` and a dedicated Redis instance on port 6382,
  DB index 15. That run failed on unavailable Typesense at port 8108.
- Stock Typesense 30.2 exited with code 139 in this local Docker environment.
  A rerun uses the existing locally patched Typesense image in a dedicated
  task container on port 8111, with throwaway credentials and collection prefix.
  Full-suite final result: pending.
- Playwright showcase baseline: input editing, Escape dismissal, light/dark
  switching passed; no browser errors and no horizontal overflow at 390px.
  Screenshots are under `docs/design/ui-refresh/baseline-*.png`.
- Asset/JSON validation: 53 non-empty exports with valid dimensions, 46 unique
  tokens, caller/route paths present, seven proposed contrast pairs pass.
- Runtime components, badge contracts, awarding logic, and production assets
  have not changed. Phase 1 does not claim a redesigned showcase or page.

## Resume checklist

- [ ] Read this handoff, the latest user instructions, and applicable rules.
- [ ] Inspect Git status and confirm recorded branch/baseline before edits.
- [ ] Check stack tracking and upstream review status; continue on the correct
      phase branch and preserve the aggregate PR as the sole merge into `main`.
- [ ] Identify the first incomplete phase and its last completed batch.
- [ ] Read recorded decisions and evidence; fetch current Figma context for the
      section being implemented rather than relying on expired asset URLs.
- [ ] Continue the recorded next action; do not restart completed phases.
- [ ] Before handing off, record changed paths/commits, check outcomes, unresolved
      issues, and the precise next task. Keep unchecked work visibly outstanding.
