# Project views and likes removal checklist

Replace project likes with a passive eye icon and real project view count while
preserving Save and Share. Image pages use their parent project's engagement.

## Decisions

- [x] Remove likes throughout the database, API, contracts and UI.
- [x] Replace like controls with an accessible, read-only eye and view count.
- [x] Keep saves independent; never convert likes into saves.
- [x] Count project and image-detail visits against the same project.
- [x] Preserve authenticated daily deduplication and organization self-view exclusion.
- [ ] User decision: include signed-out visitors in a future extension. This
      implementation retains the current authenticated-only recording policy;
      public counts remain readable without signing in.

## Implementation owned by Codex

- [x] Audit schema, API, frontend, tests, analytics and documentation dependencies.
- [x] Add regression tests for missing project-page tracking and public counts.
- [x] Add durable project view totals and backfill retained events safely.
- [x] Generate and review additive and likes-removal migrations separately.
- [x] Expose bounded public project engagement counts through shared contracts.
- [x] Share typed view tracking between project and image-detail pages.
- [x] Replace all like UI with passive eye/count indicators and retain saves/sharing.
- [x] Remove like modules, contracts, client state and schema exports.
- [x] Update component/API/E2E coverage and remove obsolete like tests.
- [x] Record an ADR and synchronize architecture, migration and testing docs.
- [x] Run typecheck, lint, unit/integration tests and affected E2E journeys.
- [x] Review the rendered desktop project eye/count UI.
- [x] Complete image, portfolio and mobile rendered verification.

## Joint review and release

- [x] Review implementation and reconcile the current main branch.
- [x] Regenerate migrations after upstream 0080; use 0081/0082 and ADR 0007.
- [x] Open PR, resolve review findings and pass CI including critical E2E.

Merge status and final-head checks are tracked live in
[PR #727](https://github.com/tickifHQ/tickif/pull/727).

- [ ] User reviews eye/count presentation on project, image and portfolio pages.
- [ ] Deploy additive totals migration before the new application code.
- [ ] Deploy web/API removal and drain old API instances before dropping likes.
- [ ] Apply the likes-removal migration and verify saves and view recording.

## Verification evidence

Verified on 2026-10-11 (Asia/Kolkata), implementation commit `17e4bf65`:

- Local workspace typecheck: all 17 tasks passed.
- Local workspace lint: all 16 tasks passed; five existing warnings, no errors.
- Post-update focused tests: 17 backend and 159 frontend tests passed.
- Fresh isolated database migration and schema drift checks passed.
- Historical-event replay verified backfill, daily duplicate rejection, new-event
  counting after cutover and totals surviving event deletion.
- [Full CI](https://github.com/tickifHQ/tickif/actions/runs/38075208383) passed
  typecheck, lint, all test tasks, production builds, telemetry smoke checks,
  migrations and drift validation. Security checks also passed.
- [Critical E2E](https://github.com/tickifHQ/tickif/actions/runs/38075208389) passed
  all 146 journeys with no skips, failures or flaky results. The project-views
  journey verifies project/image/portfolio totals, daily deduplication, saved-state
  persistence and mobile overflow. Its desktop project, desktop image and mobile
  project screenshots were reviewed; the eye/count, Save and Share are visible.
- Implementation review found no outstanding code defects. Upstream migration
  and ADR collisions were resolved before opening the PR.

Earlier full local runs exhausted Windows memory/paging and timed out against
local services. The successful isolated checks and GitHub runs above supersede
those incomplete attempts. Final-head CI must remain green before merge; use the
PR's live checks rather than treating this recorded run as approval of a later
code change.

No application deployment or shared database migration has been performed for
this task. Isolated test targets use the views1667/views727 names. The task's Redis
and Typesense containers are stopped; test databases remain available. No
unrelated local services were stopped.
