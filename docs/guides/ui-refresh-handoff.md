# Tickif UI refresh handoff and checklist

Refresh the shared system and every web UI from the
[new Figma designer profile](https://www.figma.com/design/WJhOguDptAwt2735BS2WMG/tickif--DS-?node-id=15885-4108&m=dev).
Apply it to the profile first, then remaining designer views, visitor/public
views, and admin views. Preserve data contracts and product behavior.

## Current handoff — 7 October 2026

The user reviewed the component gallery and explicitly confirmed publication:
**"great raise this PR and start working on the next phase"** on 7 October 2026.
The shared foundation is approved for publication through the single phase PR.
The final full workspace test run passed; publication is approved.
Phase 2 is the designer profile; branch it from this phase for the incremental stack.

- Branch: `codex/ui-refresh/foundations`.
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

- [x] Obtain fresh high-fidelity footer/mobile context, screenshots, compact
      variable/component-origin audit and motion context through Figma MCP.
- [x] Check Code Connect: unavailable on this Figma plan. The desktop subtree has
      no instances or variable bindings; reuse the repository's shared components.
- [ ] Compose hero, recognition, selected projects, testimonial/ratings, experience
      centres, sharing, consultation, footer, navigation and floating enquiry.
- [ ] Wire existing profile/project/review/centre data and existing actions.
- [ ] Preserve studio details and Tickif reviews absent from the reference frame.
- [ ] Map supported earned badges through the shared presentation mapping.
- [ ] Preserve New on Tickif's existing 90-day eligibility and live label.
- [ ] Do not award Client Favourite/Fast Reply without supported eligibility data.
- [ ] Keep studio/project photographs dynamic; integrate exact static assets.
- [ ] Verify desktop/mobile geometry, wrapping, long content and empty states.
- [ ] Verify enquiry/share/location links, accessibility and reduced motion.

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
| Heading font                | Helvetica Neue Medium is in Figma; existing Inter 500 is the portable implementation fallback.                                                                                                                                                 |
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

- [ ] Inspect Git status; preserve local implementation and any user changes.
- [ ] Read latest user instructions and this handoff before acting on PRs.
- [ ] Keep the shared phase separate from the profile phase; preserve the single-final-merge intention.
- [ ] Check currently running verification before restarting expensive suites.
- [ ] Continue from the first incomplete checklist item; preserve completed work.
- [ ] Record check outcomes, exact next action and changed head when handing off.
