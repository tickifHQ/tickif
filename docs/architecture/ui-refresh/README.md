# Tickif UI Refresh Specification

The new designer portfolio is the visual source for the shared system. Runtime
theme values, components, a crown presentation primitive and an interactive
gallery now apply that reference. The user approved the component gallery on
7 October 2026 for publication in the single shared phase PR. The real /d/[slug] profile composition is implemented locally and remains in phase 2 review.

## Sources and coverage

The [Figma desktop profile](https://www.figma.com/design/WJhOguDptAwt2735BS2WMG/tickif--DS-?node-id=15885-2549&m=dev)
uses a 1512px canvas. A 390px mobile frame, `15885:4109`, exists on the same
Portfolio page; use it rather than inventing the profile's mobile composition.

Detailed MCP context covers the desktop hero, recognition, projects,
testimonial, ratings, experience centres, sharing, consultation, navigation,
and floating enquiry control. On 7 October, primary MCP access was restored:
fresh high-fidelity contexts now include all eleven desktop and mobile sections,
including the footer. The desktop subtree contains no component instances or
bound variables; Code Connect lookup is unavailable on the current Figma plan.
The mobile frame's own opacity is 1%, explaining its faint screenshots; that
canvas setting must not be copied into the application. Fresh contexts for all sections were retrieved again on 8 October. The real profile now implements these compositions; circular proof text uses the exact geometry retrieved through the Plugin API. Centres can now embed official Google Maps Share URLs through the shared `GoogleMapEmbed`. The local demo uses two Bengaluru neighbourhoods. Figma's custom geographic illustration, centre media, opening hours and centre ratings remain unsupported by the current data contract.

The latest profile corrections use six project cards and two Google review cards
per displayed page, with shared Pagination and Carousel controls. Client ratings
are Google-only, with no source tabs. The rating distribution describes available
cached reviews and is labelled as a sample when fewer than the aggregate count
are available. Existing Tickif review writing/editing, moderation and pagination
remain available through booking links and legacy #tickif-reviews links, which
open the explicit review=tickif entry.
That entry respects the portfolio's Tickif overall-rating visibility setting:
disabling the summary hides its aggregate and histogram while review cards and
review actions remain available.

Centres use floating 34px Figma controls with exported pin silhouettes recoloured
to the portfolio accent over a real Google map, beside a 400px details panel. Mobile maps are 400px
high. Overview/About tabs remain functional. Portfolio imagery is labelled as
such; centre-specific media and hours are not invented. The extra Studio section
and hero Share action are removed; there is no designer save/like API. The share
card and footer social links remain. The token specification now contains 68
entries, including the source location-control shadow.

The 9 October staging corrections preserve official Google Maps embed URLs and
fall back to a safely encoded address query for ordinary links, shortened
`maps.app.goo.gl` links, or missing map URLs. Short links are navigation targets,
not embeddable documents; previously they displayed only an address placeholder.
Centre selection keeps the iframe and contact details together. Active centre
tabs use the inverse surface foreground, independent of the button foreground
chosen for the accent. Contact icons share one contrast-adjusted accent colour.

Portfolio accents now control the soft/inverse surfaces, sharing and contact
blocks, floating action, grid, orbit, highlights and shadows within the public
page, including the green project seal and laurel silhouettes. Newly created portfolios default to Tickif green (`#1E7A55`); the migration
changes only the database default and preserves saved choices. The editor offers
Tickif green alongside the existing presets. Social-image fallback uses the same
default. The footer attribution reuses the Tickif brand logo. Hero stamp text uses
centred SVG text paths and complete dynamic captions instead of the Figma source's
overlapping per-letter positions; the decorative seal exports remain unchanged.

### Supplied HTML motion reference

The user supplied Anika Spaces Portfolio (4).html on 8 October 2026. Its SHA-256
is 29d1499be55de7d0e7e1bd7b52ecbd42ca3f7a95ecc8948b4e1c21620564678a. The bundled
JSON template was decoded and its CSS and component source inspected as data;
its bundler, third-party runtime, demo data and actions are not application code.

The live profile adapts these effects to existing components:

| Effect            | Source timing / behavior                                                                     | Application                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Scroll reveal     | 32px rise; 1s cubic-bezier(.2,.7,.2,1); 12% intersection                                     | Section headings, projects, recognition, testimonial, ratings, centres and sharing |
| Stagger           | Projects alternate 120ms; recognition 80ms; reviews 90ms                                     | Newly rendered cards register after pagination too                                 |
| Statistics        | 1.6s cubic ease-out; founded year starts at 1990                                             | Real hero values; currency ranges stay unchanged; accessible labels stay final     |
| Seal orbit        | 60s linear rotation                                                                          | Inner SVG group rotates while its frame stays centred                              |
| Card tilt / light | +/-7deg Y, +/-6deg X; 120ms pointer response; 700ms reset                                    | Fine pointers only; coalesced animation frames and moving sheen                    |
| Stamp entrance    | 700ms overshoot; 500ms + 220ms stagger                                                       | First visible identity card; existing seal artwork retained                        |
| Wreath appearance | 500ms fade                                                                                   | Whole exported wreath fades; individual baked SVG leaves remain unchanged          |
| Hover             | Project image 1.04x / 1s; recognition -4px / 400ms; share card straightens and lifts / 600ms | Hover-capable fine pointers only                                                   |
| Centres           | 450ms panel fade/rise; 250ms selector colour change                                          | Real Maps embed and detail tabs; no fabricated animated map pin                    |
| Contact           | 1.8s pulse; dock 500ms slide and 400ms fade                                                  | Existing enquiry flow; hidden dock is inert and removed from accessibility tree    |

Server-rendered content is visible without JavaScript. Reduced-motion preference
changes cancel frames, restore final numbers and reveal content immediately.
Offscreen looping effects and background-tab motion pause. The client leaf scopes
all observers/listeners to this profile and cleans them up on unmount. No new
animation dependency is required. The source's unused icon/ticker demos and
removed Studio section are not reintroduced.

The first programmatic style response was truncated at 20KB. Only its complete
palette and frame inventory were retained; do not treat it as a full variable,
typography, or component-binding export.

| Artifact                                                                                                                                                 | Purpose                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [token-spec.json](./token-spec.json)                                                                                                                     | Proposed semantic values, source nodes, measured geometry, fonts, inferred dark palette, and motion           |
| [figma-palette.json](./figma-palette.json)                                                                                                               | Observed desktop fill colors with source nodes and nearby frame inventory                                     |
| [component-audit.json](./component-audit.json)                                                                                                           | Current shared component files, exports, direct callers, dependencies, overrides and route/state source files |
| [asset-manifest.json](./asset-manifest.json)                                                                                                             | Local static exports, source slots, dimensions, and imagery that must remain dynamic                          |
| [figma-hero.png](./figma-hero.png)                                                                                                                       | Hero reference screenshot                                                                                     |
| [figma-recognition.png](./figma-recognition.png)                                                                                                         | Recognition reference screenshot                                                                              |
| [figma-share.png](./figma-share.png)                                                                                                                     | Sharing reference screenshot                                                                                  |
| `figma-projects.png`, `figma-testimonial.png`, `figma-ratings.png`, `figma-centres.png`, `figma-consultation.png`, `figma-nav.png`, `figma-floating.png` | Other retrieved desktop section screenshots in this directory                                                 |
| [contrast-check.json](./contrast-check.json)                                                                                                             | Opaque text/surface pairs checked against the proposed palette                                                |

Source node IDs identify provenance. Mapping an observed color to a semantic
role is still an implementation decision; it does not assert a Figma variable
binding. Temporary asset URLs are excluded from committed artifacts. Full
reference code and remaining screenshots are cached locally under the ignored
`.ui-refresh.local` directory; obtain fresh MCP context when that cache is absent.

Run `node docs/architecture/ui-refresh/verify.mjs` from the repository root to check
asset bytes/dimensions and SHA-256 hashes (including unchanged runtime copies), token provenance, caller paths, and proposed contrast
ratios without changing the artifacts. Rebuild the component inventory when
source files change; this verifier does not discover new callers or routes.

## Semantic palette

Keep existing token names where possible. Add narrowly named roles for new
visual treatments instead of hardcoding colors in components or merging
recognition artwork into destructive/success intent colors.

| Role                              | Proposed value                              | Basis                                                                   |
| --------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------- |
| Background and standard card      | `#ffffff`                                   | Observed                                                                |
| Foreground                        | `#171612`                                   | Observed                                                                |
| Secondary body text               | `#4a473f`                                   | Observed                                                                |
| Muted foreground                  | `#6b675c`                                   | Observed                                                                |
| Decorative metadata text          | `#8a867a`                                   | Observed; contrast review required for small functional labels          |
| Primary and foreground            | `#1e7a55` / white                           | Observed CTA                                                            |
| Secondary, accent, subtle surface | `#e2ece4` / `#0f3326`                       | Observed badge and sharing surfaces                                     |
| Muted/neutral button surface      | `#f6f6f4`                                   | Observed reviews and share action                                       |
| Inverse surface and foreground    | `#0f3326` / `#f4f0e8`                       | Observed consultation section                                           |
| Soft primary CTA                  | `#8fd8b4` / `#0f3326`                       | Observed inverse-section button                                         |
| Normal/strong border              | foreground at 14% / 20% opacity             | Observed divider / outline action                                       |
| Input boundary                    | foreground at 48% light / cream at 40% dark | Inferred for distinguishable controls; stronger than decorative borders |
| Rating decoration                 | `#e8a317`                                   | Observed stars; rating text stays readable foreground                   |
| Recognition hues                  | purple, gold, clay, deep green, green, rose | Observed artwork; separate from intent status                           |

Destructive, warning, info, success and feature retain their intent semantics.
Success uses the brand green, and red/blue pairs were strengthened for readable
status text in both themes. These intent colors are inferred. A clay heading accent is not
an error indicator, and a gold recognition wreath is not a warning badge.

The proposed dark palette is explicitly inferred. Use deep green surfaces,
cream foreground, a mint primary, and warm muted text; check every text/surface
pair in the component showcase before shipping. Do not treat the dark
consultation block in the light reference as a full dark-mode specification.

## Fonts and typography

Figma uses Helvetica Neue Medium for display headings, Inter for body text,
and JetBrains Mono for metadata. No Helvetica Neue webfont files were found in
the repository. The initial display stack used Helvetica Neue/Helvetica/Arial,
with the user's fallback approval on 8 October. On 9 October, browser inspection
confirmed that portfolio headings rendered Arial on Windows; the user selected
bundled Inter Medium for consistent portfolio headings instead. The
`.designer-profile` theme scope now maps `--font-heading` to `--font-body`.
Body text remains Inter and metadata remains JetBrains Mono. Other theme scopes
retain their existing display stacks. This is an intentional substitution for
the Figma font, not an exact Helvetica Neue match.

The sharing card adapts its statistics/photo layout to its own available width,
so years and budgets stay readable at tablet as well as mobile widths.
The portfolio OG image reproduces this card with the same facts and fonts;
see [public sharing metadata](../social-sharing.md) for rendering and media fallbacks.
Hero seal captions follow concentric text paths inside the dotted ring, with
separate top/bottom baseline radii to account for the direction of the lettering.

Keep `--font-body`, `--font-heading`, and `--font-code` as the theme contracts.
The app loads Inter and JetBrains Mono through `next/font`, with their font
variables on `<html>` so the root theme can resolve them. Map display
sizes into dedicated semantic type roles (`text-display`, `text-section`) rather than applying the
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

| Component family                                  | Shared implementation                                                                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Buttons                                           | Pill shape; primary, inverse, neutral, outline, ghost, link, and destructive roles; retain compact/icon variants                                       |
| Inputs and composed fields                        | Warm borders, white surface, rectangular radius, consistent labels and validation; custom select popup preserves form submission and keyboard behavior |
| Dropdowns, dialogs, tooltips                      | Rounded surfaces with warm shadows, semantic selection/focus, existing keyboard and dismissal behavior                                                 |
| Badges and avatars                                | Compact metadata chips and availability indicators; artwork belongs in a separate recognition composition                                              |
| Cards, tables, pagination                         | Softer surfaces and separators; maintain dense row alignment and horizontal overflow when necessary                                                    |
| Tabs                                              | Preserve segmented behavior; add the source's line-style treatment for experience-centre tabs as a variant                                             |
| Checkbox, switch, slider                          | Match primary/border roles without weakening native or Radix semantics                                                                                 |
| Alerts and empty/loading states                   | Match typography and surfaces while preserving intent distinction and accessible status announcements                                                  |
| Carousel, collapsible content, rating, icon stack | Reuse existing behavior; update tokens, icon geometry, and motion preferences                                                                          |

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

## Current implementation and remaining profile extraction

The phase 1 gallery at `/design-system` exercises its 35 shared component files.
The additional `GoogleMapEmbed` brings the audit to 36 and is exercised in the
real public profile's centre section.
New light/dark values replace the old dark heading/ghost contrast issues.
Generic form controls, reduced-motion states, custom accent behavior, and exact
crown exports are included. Generated baseline and verification screenshots
are retained outside committed source, following current main's guidelines.
The [component review guide](../../guides/shared-ui-review.md) records each
component's behavior; the [handoff](../../guides/ui-refresh-handoff.md) tracks
validation and the user confirmation gate.

- [x] Restore primary-account MCP capacity or provide the required file access
      to the other connected account.
- [x] Fetch high-fidelity desktop footer and mobile section context, screenshots,
      and any additional assets or responsive values.
- [ ] Re-run a compact style/variable/component-origin audit in outputs below
      the 20KB response cap. Honor any discovered Code Connect/component mappings.
- [x] Retrieve fresh desktop/mobile motion context.
- [ ] Capture designer, visitor, and admin baseline screenshots with suitable
      fixtures/session access; the unauthenticated `/design-system` baseline exists.
- [ ] Complete profile fidelity and role-page validation after shared-component
      approval. Do not create a duplicate aggregate PR for the current phase.

See [the phased handoff](../../guides/ui-refresh-handoff.md) for delivery tracking,
completion gates, and subsequent role rollout.

## Portfolio configuration compatibility

The owner editor and public profile share recognition artwork through
`apps/web/src/lib/portfolio-recognition.ts` and the UI package RecognitionBadge.
Google summary visibility is independent of review-card visibility; the public
section and navigation follow the available enabled Google content. Existing
publication gates, editor persistence, enquiry authorization and explicit Tickif
review entry routes remain in place. See the [publishing audit](../../guides/portfolio-publishing-audit.md)
for verified owner/visitor workflows and remaining external-provider limits.
