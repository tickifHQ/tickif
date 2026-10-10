# Portfolio publishing and CTA audit

Phase 2, 9 October 2026. The public route is `/d/[slug]`; the owner editor is
`/designer/portfolio`. This audit accompanies the designer-profile phase stacked
on the shared UI foundation (#710), published as [PR #713](https://github.com/tickifHQ/tickif/pull/713).

## Corrections found during the audit

- Google review cards and the aggregate rating are independent settings. The
  profile previously gated the whole section on review-list visibility. It now
  retains an enabled rating summary when both lists are off, and omits navigation
  when neither the Google summary nor Google reviews are available.
- Owner badge previews now reuse `RecognitionBadge` and the same artwork mapping
  as the public page. Eligibility remains server-controlled.
- Editor switches and hero fields have explicit accessible names. Guidance now
  describes the Google rating summary and selectable centre maps, replacing
  references to the previous trust strip and public state-group layout.
- Browser regression expectations follow the established-year hero and selected
  centre detail panel; office count remains editable and in the API contract.
- The initial PR security gate identified Next.js 16.3.7 advisory
  [GHSA-cjq9-62q9-8jv4](https://github.com/advisories/GHSA-cjq9-62q9-8jv4).
  The workspace now pins the patched 16.3.8 release; the audit threshold stays unchanged.
- CI browser traces exposed a reveal/focus race that could move an enquiry or
  like button between pointerdown and pointerup. Pointer focus no longer snaps
  the reveal; pending invisible content cannot intercept clicks. Keyboard focus
  still reveals its target immediately.
- Motion now also handles an explicitly unavailable `IntersectionObserver`
  without crashing the portfolio after navigation from designer discovery.

## Live browser verification

The audit used the isolated local UI database and the actual application on port
3020, with the seeded Studio Meraki owner and a synthetic visitor. It did not use
the design-system preview or intercept application responses. All edited studio
content and visibility settings were restored after verification.

| Workflow / CTA                                                                 | Verified result                                                                                                        |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Guest hero enquiry                                                             | Opens inline login; OTP sign-in returns to the portfolio.                                                              |
| Owner sign-in and studio selection                                             | Opens the correct studio dashboard and portfolio editor.                                                               |
| Public link off / on, Save                                                     | Hidden status removes saved public links and public route returns 404; republishing restores Live and the public page. |
| Hero tagline edit                                                              | Saved text appears in the actual hero and footer; restored afterwards.                                                 |
| Recognition, testimonial, social links, share block toggles                    | Saved switches remove the corresponding live content; restoring them restores the content.                             |
| Google reviews off, summary on                                                 | Cards hide while the aggregate stays visible.                                                                          |
| Google summary off, reviews on                                                 | Summary hides while the carousel remains visible.                                                                      |
| Experience centre edit                                                         | Saved name reaches the selector and selected detail panel; original name restored.                                     |
| Own-studio enquiry                                                             | Disabled across the profile; cannot enquire about own studio.                                                          |
| Signed-in visitor enquiry                                                      | Clearly labeled synthetic enquiry submits successfully and appears in Your Enquiries.                                  |
| Header, hero, centre, share block, closing banner, footer and floating enquiry | Use the same availability state; existing enquiry opens duplicate-protection dialog rather than another form.          |
| View Your Enquiries                                                            | Opens the signed-in visitor's persisted enquiry.                                                                       |
| Visitor access to owner editor                                                 | Redirects to Access denied.                                                                                            |
| Share this card / Copy link                                                    | Clipboard contains the canonical portfolio URL without the section hash.                                               |
| Project views                                                                  | Shows a passive eye and real project views; authenticated detail visits count once per UTC day.                        |
| Featured / Newest / Top rated / Largest                                        | Selected sort changes and returns to Featured.                                                                         |
| Project card / View profile                                                    | Opens the real image-detail page and returns to the portfolio.                                                         |
| Review numbered pages and arrows                                               | Page 3 shows the final review; Next disables; Previous returns to page 2; page 1 can be restored.                      |
| Centre selection / Overview / About                                            | Map and detail content follow the selected centre; About uses the saved studio bio.                                    |
| Section links / Back to top                                                    | Navigate to the corresponding existing section anchors.                                                                |

External Maps and Instagram destinations were checked against the rendered link
targets. Embedded Google Maps loads real maps. Third-party pages and their
controls are outside the application test boundary. Google connection refresh
was not sent using the deliberately synthetic business ID in the demo fixture.

## Automated verification and limits

- Legacy `#tickif-reviews` links are handled both on initial load and when the
  hash changes on an already mounted portfolio. Regression tests cover the
  redirect, explicit review URLs and listener cleanup.
- Editor and profile component tests: 152 passing, including the independent
  Google-summary regression, save/error handling, section settings and editor
  validation.
- Workspace typecheck and lint pass. Existing API lint warnings are unchanged.
- Asset/token/component inventory verification passes.
- Motion and floating enquiry regression tests: eight passing, including unavailable observer support
  and pointer-focus behavior. The two portfolio API suites pass all 101 tests
  with `PUBLIC_WEB_URL=http://localhost:3000`, matching their fixture contract.
- The fresh local root run completed 15 of 17 tasks before failing: web had
  1,737 passing tests and 11 failures across five files; API canonical-URL
  assertions inherited the local demo origin. All five web files subsequently
  pass their 186 tests at the default timeout with one worker. The isolated
  worker suite passes all 225 tests. This is not recorded as a clean root pass.
- GitHub's initial typecheck/lint/test/build gate passes. The patched dependency
  security gate passes; the final browser and build checks remain tracked on #713.
- The local production build passes on Next.js 16.3.8 (all three build tasks).
- Playwright journey sources were updated and typechecked. The live journeys
  above ran through the desktop browser; the complete Playwright suite still
  runs in CI. Project pagination beyond the two-project demo is covered by
  component regressions rather than claimed as a live fixture check.
- During development hot reload and the hidden-profile 404 transition, Next's
  development runtime emitted a script-render warning and a negative performance
  timestamp diagnostic. These are recorded separately from functional results;
  do not present the development console as entirely error-free.
- After installing Next.js 16.3.8, automatic approval review rejected restarting
  the existing local web process as "blocked by policy". That process must be
  restarted before certifying the patched runtime on port 3020. CI starts from
  the updated lockfile independently.

Private fixture snapshots, raw logs and screenshots stay outside committed
source under the task's local artifact paths. No production data or schema was
changed for this audit.
