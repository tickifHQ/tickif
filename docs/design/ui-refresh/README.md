# Tickif UI Refresh Specification

Phase 1 converts the new designer portfolio reference into a shared token and
component specification. The production theme and UI components are unchanged
in this batch. Phase 2 applies the specification in `@repo/ui`.

## Sources and coverage

The [Figma desktop profile](https://www.figma.com/design/WJhOguDptAwt2735BS2WMG/tickif--DS-?node-id=15885-2549&m=dev)
uses a 1512px canvas. A 390px mobile frame, `15885:4109`, exists on the same
Portfolio page; use it rather than inventing the profile's mobile composition.

Detailed MCP context covers the desktop hero, recognition, projects,
testimonial, ratings, experience centres, sharing, consultation, navigation,
and floating enquiry control. Recognition was captured in the preceding
planning turn. The current account exhausted its MCP quota before footer and
mobile extraction and a compact variable/component-source audit completed.
The other connected account does not have the file access required by MCP.

The first programmatic style response was truncated at 20KB. Only its complete
palette and frame inventory were retained; do not treat it as a full variable,
typography, or component-binding export.

| Artifact                                                                                                                                                 | Purpose                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| [token-spec.json](./token-spec.json)                                                                                                                     | Proposed semantic values, source nodes, measured geometry, fonts, inferred dark palette, and motion                              |
| [figma-palette.json](./figma-palette.json)                                                                                                               | Observed desktop fill colors with source nodes and nearby frame inventory                                                        |
| [component-audit.json](./component-audit.json)                                                                                                           | All 33 shared component files, exports, direct callers, internal dependencies, sample overrides, and 81 route/state source files |
| [asset-manifest.json](./asset-manifest.json)                                                                                                             | Local static exports, source slots, dimensions, and imagery that must remain dynamic                                             |
| [figma-hero.png](./figma-hero.png)                                                                                                                       | Hero reference screenshot                                                                                                        |
| [figma-recognition.png](./figma-recognition.png)                                                                                                         | Recognition reference screenshot                                                                                                 |
| [figma-share.png](./figma-share.png)                                                                                                                     | Sharing reference screenshot                                                                                                     |
| `figma-projects.png`, `figma-testimonial.png`, `figma-ratings.png`, `figma-centres.png`, `figma-consultation.png`, `figma-nav.png`, `figma-floating.png` | Other retrieved desktop section screenshots in this directory                                                                    |
| [baseline-desktop.png](./baseline-desktop.png), [baseline-dark.png](./baseline-dark.png), [baseline-mobile.png](./baseline-mobile.png)                   | Existing `/design-system` before production changes                                                                              |
| [contrast-check.json](./contrast-check.json)                                                                                                             | Opaque text/surface pairs checked against the proposed palette                                                                   |

Source node IDs identify provenance. Mapping an observed color to a semantic
role is still an implementation decision; it does not assert a Figma variable
binding. Temporary asset URLs are excluded from committed artifacts. Full
reference code and remaining screenshots are cached locally under the ignored
`.ui-refresh.local` directory; obtain fresh MCP context when that cache is absent.

Run `node docs/design/ui-refresh/verify.mjs` from the repository root to check
asset bytes/dimensions, token provenance, caller paths, and proposed contrast
ratios without changing the artifacts. Rebuild the component inventory when
source files change; this verifier does not discover new callers or routes.

## Semantic palette

Keep existing token names where possible. Add narrowly named roles for new
visual treatments instead of hardcoding colors in components or merging
recognition artwork into destructive/success intent colors.

| Role                              | Proposed value                              | Basis                                                          |
| --------------------------------- | ------------------------------------------- | -------------------------------------------------------------- |
| Background and standard card      | `#ffffff`                                   | Observed                                                       |
| Foreground                        | `#171612`                                   | Observed                                                       |
| Secondary body text               | `#4a473f`                                   | Observed                                                       |
| Muted foreground                  | `#6b675c`                                   | Observed                                                       |
| Decorative metadata text          | `#8a867a`                                   | Observed; contrast review required for small functional labels |
| Primary and foreground            | `#1e7a55` / white                           | Observed CTA                                                   |
| Secondary, accent, subtle surface | `#e2ece4` / `#0f3326`                       | Observed badge and sharing surfaces                            |
| Muted/neutral button surface      | `#f6f6f4`                                   | Observed reviews and share action                              |
| Inverse surface and foreground    | `#0f3326` / `#f4f0e8`                       | Observed consultation section                                  |
| Soft primary CTA                  | `#8fd8b4` / `#0f3326`                       | Observed inverse-section button                                |
| Normal/strong border              | foreground at 14% / 20% opacity             | Observed divider / outline action                              |
| Rating decoration                 | `#e8a317`                                   | Observed stars; rating text stays readable foreground          |
| Recognition hues                  | purple, gold, clay, deep green, green, rose | Observed artwork; separate from intent status                  |

Preserve existing destructive, warning, info, success, and feature semantics
until their components are restyled and checked. A clay heading accent is not
an error indicator, and a gold recognition wreath is not a warning badge.

The proposed dark palette is explicitly inferred. Use deep green surfaces,
cream foreground, a mint primary, and warm muted text; check every text/surface
pair in the component showcase before shipping. Do not treat the dark
consultation block in the light reference as a full dark-mode specification.

## Fonts and typography

Figma uses Helvetica Neue Medium for display headings, Inter for body text,
and JetBrains Mono for metadata. No Helvetica Neue webfont files were found in
the repository. Use the existing loaded Inter family at weight 500 as the
portable heading fallback until an approved Helvetica Neue webfont is supplied.
Record the fallback as a visual deviation and compare wrapping at each width;
do not depend on a locally installed font for consistent cross-platform output.

Keep `--font-body`, `--font-heading`, and `--font-code` as the theme contracts.
The app already loads Inter and JetBrains Mono through `next/font`. Map display
sizes into dedicated semantic type roles in Phase 2 rather than applying the
profile's 94px hero size to every screen heading.

| Desktop role       | Size and line height                | Tracking       |
| ------------------ | ----------------------------------- | -------------- |
| Hero               | 94px / 86.24px                      | -4.687px       |
| Section title      | 32px / source automatic line height | -0.96px        |
| Testimonial        | 32px / 40px                         | -0.8px         |
| Metric             | 44px / 44px                         | -1.76px        |
| Sharing title      | 66px / 61.4px                       | -2.939px       |
| Consultation title | 108px / 95.8px                      | -4.899px       |
| Body               | 18px / 27.9px                       | normal         |
| Metadata           | 10px, JetBrains Mono                | commonly 1.2px |

Use Inter for functional controls and keep dense table/form text legible.
SF Pro, Arial, Menlo, and Lucida Grande in embedded map or symbol layers do not
establish new global font roles. Exported artwork remains artwork.

## Geometry and component migration

The desktop reference uses a 1328px content area, 56px section padding,
128px gaps before major sections, and a 72px inset in the sharing block.
These are composition values, not default padding for every card or dialog.

The primary hero CTA is approximately 50px tall with 24px horizontal padding
and 16px text. The inverse CTA is 64px tall. Location pills are 34px tall.
Buttons are pill-shaped, while text inputs and overlay surfaces should use
rounded rectangles. Preserve compact controls for admin and designer tables.

Use the measured 22px location-card radius and 36px sharing-block radius as
separate semantic roles. A 12px base radius for ordinary controls is inferred;
keep smaller radii for table selection and nested elements. Extend `cva`
variants or size/shape props before introducing replacement primitives.

The component audit includes direct imports and dependency edges. Review both:
updating `input` also affects `number-input`, and changing `label` affects
composed form controls. `reui/icon-stack` has no direct app caller but remains
part of the package inventory. Sampled override lists are not exhaustive.

| Component family                                  | Phase 2 implementation direction                                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Buttons                                           | Pill shape; primary, inverse, neutral, outline, ghost, link, and destructive roles; retain compact/icon variants   |
| Inputs and composed fields                        | Warm borders, white surface, rectangular radius, consistent labels and validation; preserve native/select behavior |
| Dropdowns, dialogs, tooltips                      | Rounded surfaces with warm shadows, semantic selection/focus, existing keyboard and dismissal behavior             |
| Badges and avatars                                | Compact metadata chips and availability indicators; artwork belongs in a separate recognition composition          |
| Cards, tables, pagination                         | Softer surfaces and separators; maintain dense row alignment and horizontal overflow when necessary                |
| Tabs                                              | Preserve segmented behavior; add the source's line-style treatment for experience-centre tabs as a variant         |
| Checkbox, switch, slider                          | Match primary/border roles without weakening native or Radix semantics                                             |
| Alerts and empty/loading states                   | Match typography and surfaces while preserving intent distinction and accessible status announcements              |
| Carousel, collapsible content, rating, icon stack | Reuse existing behavior; update tokens, icon geometry, and motion preferences                                      |

## States inferred for missing controls

These rules fill gaps in the supplied frame and require showcase verification.

| State          | Proposed treatment and behavior                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Hover          | Slightly darken primary/inverse fills; use subtle warm/green surfaces for neutral, outline, and menu rows; avoid layout shifts |
| Pressed        | Small existing button feedback with motion preference respected; stable border/size                                            |
| Focus          | Visible 2px semantic ring with offset; never hide keyboard focus to match a static screenshot                                  |
| Selected       | Subtle green surface and strong foreground; show selection through more than color where relevant                              |
| Disabled       | Muted surface/text and native disabled semantics; preserve labels and stable geometry                                          |
| Invalid        | Destructive border plus associated text; preserve `aria-invalid`, `aria-describedby`, and validation messages                  |
| Loading        | Preserve width, accessible progress/status, and existing duplicate-action protection                                           |
| Success        | Existing success semantics and readable copy; separate from verification/recognition eligibility                               |
| Reduced motion | Static location marker; disable pulse/decorative motion without removing interaction feedback                                  |

Use a minimum of 44px for standalone mobile action targets where practical;
compact desktop table controls may remain smaller. Keep form text at 16px on
mobile where needed. These are inferred interaction choices, not measured
mobile-frame values; mobile extraction remains outstanding.

## Recognition and data decisions

The six source wreath exports are 150×132px and contain decoration; the inner
labels and dates/counts are live text layers. Preserve their dimensions and
colors. The hero has circular seals made of separate exported vector layers;
do not substitute the recognition wreaths into those slots.

| Current badge        | Presentation decision                                                | Eligibility                          |
| -------------------- | -------------------------------------------------------------------- | ------------------------------------ |
| `verified`           | Use Verified Studio wreath and source purple                         | Existing KYC result                  |
| `top-performer`      | Use gold Top Performer wreath                                        | Existing rating/review thresholds    |
| `established`        | Use deep-green Established wreath                                    | Existing experience threshold        |
| `projects-published` | Use green wreath and actual project count                            | Existing published-project threshold |
| `new`                | Keep New on Tickif with a matching purple wreath treatment           | Existing joined-in-last-90-days rule |
| Client Favourite     | Retain export as reference; do not award or render as earned         | No current contract/eligibility rule |
| Fast Reply           | Retain export as reference; do not claim a response-time achievement | No current contract/eligibility rule |

The `new` artwork reuse is an inferred presentation decision, not a Figma
variant. Reuse the verified wreath decoration with distinct live text; do not
recolor/redraw the export. New achievements need a separately specified and
tested product change before becoming eligible.

Keep `PORTFOLIO_BADGE_PRESENTATION` shared between settings and public profiles.
Do not hardcode Anika Spaces, 28 projects, 2018, a review count, response time,
or sample card serial number into a production component. Years and counts
must come from existing data; omit unsupported fields.

Portfolio accent customization remains supported through
`apps/web/src/lib/portfolio-accent.ts`. New primary hover/focus styling must
respect its scoped `--primary` and `--primary-foreground` values; avoid
hardcoding the green reference at the profile callsite.

## Motion and assets

The planning motion context identified marker node `15885:3736`: a 2.2-second
linear repeating pulse, expanding from 16px to 80px and back while opacity
moves from 0.32 to zero and back. Re-fetch current motion data before coding it;
the fresh request was quota-blocked. Prefer existing CSS animation facilities
over adding a motion dependency solely because generated reference code imports
one. Respect reduced motion.

The local asset inventory includes 53 static exports and 10 dynamic photo
slots. Use the manifest's file paths rather than expired Figma URLs. Before
production integration, validate each source slot, wrapper geometry, and SVG
root size against current detailed context. Map artwork is a design reference;
preserve real centre selection, links, and location data when making it live.

## Remaining Phase 1 work

The baseline showcase was checked at 1440px and 390px: name-field editing,
dialog dismissal with Escape, light/dark switching, no mobile horizontal
overflow, and no browser errors. Its existing dark mode renders several
headings and ghost-button text with low contrast; treat this as a Phase 2
verification target, not evidence that the new dark palette is already applied.

- [ ] Restore primary-account MCP capacity or provide the required file access
      to the other connected account.
- [ ] Fetch high-fidelity desktop footer and mobile section context, screenshots,
      and any additional assets or responsive values.
- [ ] Re-run a compact style/variable/component-origin audit in outputs below
      the 20KB response cap. Honor any discovered Code Connect/component mappings.
- [ ] Retrieve fresh desktop/mobile motion context.
- [ ] Capture designer, visitor, and admin baseline screenshots with suitable
      fixtures/session access; the unauthenticated `/design-system` baseline exists.
- [ ] Complete the phase gate and update the handoff before declaring Phase 1
      complete. Keep the foundations and aggregate PRs draft until their work is ready.

See [the phased handoff](../../ui-refresh-handoff.md) for stack tracking,
completion gates, and subsequent role rollout.
