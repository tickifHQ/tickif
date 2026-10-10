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
- [ ] Run typecheck, lint, unit/integration tests and affected E2E journeys.
- [x] Review the rendered desktop project eye/count UI.
- [ ] Complete image, portfolio and mobile rendered verification.

## Joint review and release

- [x] Review implementation and reconcile the current main branch.
- [x] Regenerate migrations after upstream 0080; use 0081/0082 and ADR 0007.
- [ ] Open PR, resolve review findings and pass CI including critical E2E.
- [ ] Merge the verified PR.
- [ ] User reviews eye/count presentation on project, image and portfolio pages.
- [ ] Deploy additive totals migration before the new application code.
- [ ] Deploy web/API removal and drain old API instances before dropping likes.
- [ ] Apply the likes-removal migration and verify saves and view recording.

## Verification evidence

- Focused backend tests: 17 passed, including real database migrations and counts.
- Focused frontend tests: 12 new tracker/count tests passed; surrounding component
  suites passed in the initial focused run.
- Initial workspace typecheck: 17 tasks passed. A final repeat after the last
  tracker/test refinements was interrupted during host memory exhaustion.
- Workspace lint: 16 tasks passed; five existing warnings in unrelated tests.
- Full repository test attempt: search-ranking integration tests timed out; the
  remaining run was stopped after host free memory fell to about 250 MB.
- Broad browser attempt: marketplace journey failed amid Typesense request
  timeouts; the remaining run was stopped to release memory. Full verification
  is not complete. Logs are in ignored test-results/project-engagement-tests.log
  and test-results/project-engagement-e2e.log.
- Final focused frontend checks: 19 tests passed (project page, tracker and count).
- Dedicated browser retry reached a real 1-view project total and saved-state
  persistence across reload. Desktop screenshot reviewed at
  `test-results/e2e/project-views-project-view-2054d-ages-without-changing-saves/views-desktop.png`.
  The complete journey did not finish: Windows reported a paging-file-too-small
  error, and the task's browser/server processes were stopped to release memory.
  Log: `test-results/project-engagement-views-e2e.log`. Browser checks must be rerun.
- Browser plugin not available; rendered verification uses repository Playwright.

No application deployment or shared database migration has been performed for
this task. Test databases and services are isolated under the views1667 name.
The task's test Redis and Typesense containers are stopped. Test databases remain
available for a later rerun; no unrelated local services were stopped.
