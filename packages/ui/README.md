# @repo/ui

Tickif design system: themeable tokens + shadcn-style components (Tailwind v4, Radix).

Current refresh reference: [designer portfolio](https://www.figma.com/design/WJhOguDptAwt2735BS2WMG/tickif--DS-?node-id=15885-4108&m=dev).
The [Figma specification](../../docs/architecture/ui-refresh/README.md) records
extracted tokens, component callers, local artwork, and inferred control states.
The theme now applies its green, warm neutral, and mint palette. Missing controls
and dark-mode values are inferred. Review working examples at `/design-system`
using the [component review guide](../../docs/guides/shared-ui-review.md).

## Token architecture

`Reveal` is an optional scroll entrance wrapper. It keeps server-rendered content
visible, enhances with IntersectionObserver, and fades once on viewport entry.
Use `delay` (milliseconds, capped at 400) for short staggered groups. It respects
live reduced-motion changes, shows keyboard-focused content immediately, and
disconnects observers on entry/unmount. Its styles are included by `globals.css`.

Three layers, each swappable without touching the one below:

1. **Theme values** — `src/styles/themes/*.css`. Each theme defines semantic CSS variables (`--primary`, `--font-body`, `--radius`, …) scoped to `[data-theme='<name>']`, with dark-mode overrides under `.dark`. The default theme (`tickif`) is also bound to `:root`.
2. **Tailwind bridge** — `@theme inline` in `src/styles/globals.css` maps semantic variables to Tailwind utilities (`bg-primary`, `font-display`, `rounded-lg`, …).
3. **Components** — `src/components/*` use only the bridged utilities, never raw values. Restyling the app = editing a theme file.

### Tokens

- **Surfaces:** `background`, `card`, `popover` (+ `-foreground`)
- **Visitor discovery:** `visitor-home-background` aliases the existing warm
  `account-menu-subtle` color (`#faf9f6` in light mode) with its dark mapping.
  The `/home` page and visitor header use it without changing global surfaces.
  `visitor-header-background` adds Figma's 88% translucent navigation surface.
  `navigation-logo` is a semantic spacing utility for its measured 10.4px logo
  padding. It preserves the original mark and wordmark dimensions.
  Terracotta counters use `badge-terracotta` / `badge-terracotta-foreground`.
  Small-label terracotta is darkened from Figma's `#c2603a` to meet 4.5:1 contrast.
  All have dark mappings and are opt-in, preserving other account surfaces.
  Account initials retain the original DiceBear-generated identity colors.
  `visitor-preference` provides Figma's paper tag surface (`#eae7df`) with a dark
  mapping. `summary-radius` and `summary-card-shadow` support compact activity
  summaries without changing default cards.
- **Intent:** `primary`, `secondary`, `muted`, `accent`, `destructive`, `success`, `warning`, `info`, `feature` (+ `-foreground` where needed, plus lighter state surfaces)
- **Chrome:** `border`, `input`, `ring`, `radius`
- **Sign-in:** `auth-field-border`, `auth-field-divider`, `--auth-field-shadow`,
  `bg-auth-welcome` preserve the login-specific Figma field treatment and original
  dark green welcome gradient without changing the shared input boundary.
- **Control geometry:** `rounded-lg` (12px), `rounded-card` (22px),
  `rounded-feature` (36px), `rounded-popover` (16px), `rounded-checkbox` (5px)
- **Typography:** `text-display` (responsive display), `text-section` (32px),
  `text-metadata` (10px, spaced mono metadata)
- **Profile surfaces:** `surface-subtle`, `surface-inverse` (+ foreground),
  `foreground-secondary`, `foreground-subtle` (decorative), `overlay`, `rating`
- **Buttons:** `button-neutral`, `button-inverted`, `button-fancy` (+ foreground, hover, shadow tokens)
- **Charts:** `chart-1` … `chart-5`
- **Fonts:** `--font-body` → `font-sans`, `--font-heading` → `font-display`, `--font-code` → `font-mono`

Homepage and sign-in text styles are composed from `@repo/ui/lib/typography`,
measured from Figma home frame `16095:51371`. These classes include the semantic
family, weight, size, line height and tracking together. Figma percent tracking is
converted to em (for example, 6% is `0.06em`); pixel tracking remains in pixels.
Responsive compositions may override size/leading while preserving the font role.
Search suggestion group labels use `typography.searchLabel`, whose rem-based
size comes from `type-search-label-size` and whose leading/tracking reuse the
theme's metadata tokens. Navbar callers do not duplicate pixel font sizes.

## Switching the theme

- **Dark mode:** handled by `next-themes` via the `ThemeProvider` component (`class` strategy). Use `ModeToggle` or `useTheme()`.
- **Brand theme:** set `data-theme="<name>"` on `<html>`. No attribute = `tickif`.

### Adding a theme

1. Copy `src/styles/themes/tickif.css` to `themes/<name>.css`.
2. Rescope selectors to `[data-theme='<name>']` (and `[data-theme='<name>'].dark`), drop the `:root`/bare-`.dark` selectors (those mark the default), and change the values.
3. Import it in `globals.css` after the default theme.
4. Set `data-theme="<name>"` on `<html>` (statically or from user settings).

## Fonts

The app loads fonts (e.g. `next/font`) and exposes them as `--font-sans-base`, `--font-display-base`, `--font-mono-base` on `<html>`. They must be available where the theme declares its semantic variables (`:root`), otherwise those variables resolve to system fallbacks before reaching `<body>`. Themes map the loaded fonts to semantic font roles; the loaders live in `apps/web/app/layout.tsx`.

## Syncing from Figma

Follow the [phased handoff](../../docs/guides/ui-refresh-handoff.md). Theme values live
in `themes/tickif.css`, Tailwind bridges in `globals.css`, and font loaders in
`apps/web/app/layout.tsx`. The refresh also requires shared component variants,
sizes, and states; theme changes alone cannot reproduce the new compositions.
Preserve existing token names and component APIs where possible and audit
callers before changing defaults.

## Adding components

Run from `apps/web` using its aliases into `@repo/ui`:

```sh
pnpm dlx shadcn@latest add <component>
```

Generated components land in `src/components/` and already consume the semantic tokens. The shared control gallery lives at `/design-system` in the web app. `GoogleMapEmbed` is reviewed in the real `/d/[slug]` profile's centre section with an official embed URL or its address fallback.

## Shared component additions

- `Button`: `shape="pill"` is the default; `shape="rounded"` opts into control
  corners. `variant="soft"` supports inverse sections. `size="lg"` is 50px,
  `size="xl"` is 64px; `icon-sm` is 32px. Existing compact/fancy sizes remain.
  Native button type and `asChild` behavior are preserved; callers still specify
  `type="button"` for non-submit actions.
  `size="navigation"` provides the visitor toolbar's measured 40px actions,
  13px labels and 15px icons; `icon-xs` supplies the 24px search-clear control.
  `hero-search` owns the existing 54px landing-search action using spacing-scale
  utilities rather than a caller-supplied pixel height.
  `discovery-tab` and `discovery-category` variants/sizes provide the compact
  visitor rail without changing defaults: pressed/current tabs use the foreground
  surface; category chips have a card surface, soft border and inset thumbnail.
  Selection comes from `aria-pressed` or `aria-current="page"`.
  `project-save` uses the Figma 94%-opaque white `project-save` surface (with
  a theme-aware dark counterpart) and the primary surface when
  pressed. Its matching size provides a 32px-high desktop pill with 14px icons
  and a 44px-high, minimum 44px-wide target on non-hover devices;
  app compositions own the Save/Saved/Unsave labels. The shared control reveals
  the unsaved circle into a pill over 200ms using a small clip-path reveal,
  icon transform and label fade, without animating width or moving card layout.
  Its clipped hit target matches the visible surface. Reduced motion makes
  the reveal immediate; keyboard focus opens it with an inset focus ring.
  `variant="muted-link"` with `size="inline"` provides an underlined secondary
  text action with a minimum 24px target and no horizontal padding.
- `Card`: default radius is `card`; `radius="feature"`, `variant="subtle"`, and
  `variant="inverse"` support profile surfaces. Existing variants/radii remain.
  Inverse cards require inverse foreground utilities for descriptions/actions.
  `variant="summary"`, `radius="summary"` and `size="inline"` provide the
  light-border, 18px-radius compact activity card with shared semantic shadow.
- `Badge`: `variant="soft"` joins the existing status-chip variants.
  `size="navigation"` uses the existing Mono/XS style with 6px horizontal and
  2px vertical padding for 16px header counters. `shortcut` has 3px vertical
  padding for the 18px keyboard hint. Other badge sizes remain unchanged.
  `contrast` is a neutral high-contrast counter surface; `terracotta` is the warm
  visitor enquiry counter. These do not reinterpret totals as unread counts.
  `variant="preference"` and `size="label"` provide warm 13px filter labels;
  `variant="text"` and `size="text"` provide unfilled inline count annotations.
  `variant="project-budget"` and `size="media"` reuse the measured Mono/XS
  style for a 20px, 92%-opaque image budget capsule with 6px backdrop blur.
  The surface has a theme-aware dark counterpart; existing badge defaults stay unchanged.
- `Select`: shadcn/Radix compound primitive with shared trigger, popup and option
  tokens. [API](https://www.radix-ui.com/primitives/docs/components/select).
  `SelectTrigger variant="navigation"` opts into the measured 32px city pill,
  Label/M typography and 12px chevron without changing normal form fields.
  `SelectField` composes it with labels and errors; controlled `value` /
  `onValueChange`, optional clearing, `name`, `form`, `required`, and disabled
  states remain available. Options can also set `disabled`. Compact caller styles
  target `[data-slot=select-trigger]`; the visible control is now a button.
  The primitive is generated from the existing shadcn new-york registry template.
  Select 2.3.7 shares Dialog's focus/dismissal layers; keep those dependencies
  aligned when updating. The CLI's Windows alias resolver pointed outside this
  checkout, so its inspected registry template was saved to this package explicitly.
- `RecognitionBadge`: accepts `artwork`, `label`, optional `eyebrow`, `detail`, `description`, and
  figure props. Artwork is decorative; the live caption supplies accessible
  text inside the laurel, with an optional description below. It does not
  determine eligibility or award badges. The app owns exact
  Figma SVGs under `apps/web/public/ui/recognition/`.
- `TabsList`: `variant="segmented"` is the default; `variant="line"` renders
  underlined navigation while retaining Radix selection and keyboard behavior.
- Form controls share internal `control-styles.ts` for default, hover, focus,
  invalid, disabled, and reduced-motion states. `NumberInput` continues to
  compose `Input`; month selection composes shared `Button` variants and an
  editable text field with YYYY-MM pattern validation. It opens only the component
  picker, avoiding a simultaneous native browser month picker.
- ReUI `Rating` remains read-only with clamped values and descriptive ARIA text.
  Its stars use the dedicated `rating` token. `IconStack` retains its installed
  composition and is reused by `EmptyState`.
  ReUI `Timeline` is a read-only event/progress display, with a documented
  controlled value and horizontal/vertical orientation. Its shared primitive is
  used by the enquiry milestone composition; its indicators do not invent events.
- `GoogleMapEmbed`: renders a lazy, accessible iframe from an HTTPS Google Maps
  Share → Embed URL. A title is required; unsupported hosts, schemes, credentials,
  ports and non-embed paths are never used as iframe sources. An optional `query`
  supplies an address fallback encoded into a fixed Google Maps URL; without a
  valid source or nonempty query, nothing renders. The profile keeps its separate
  Open in Maps link. Unit tests inspect server markup without loading Google;
  browser checks verify the interactive map.

Custom portfolio accents must override primary, primary foreground, primary hover,
primary shadow, ring, soft/inverse surfaces and decorative accents together.
The web app's validated `portfolioAccentStyle`
helper does this while maintaining black/white foreground contrast.

## Loading dots

`LoadingDots` is a decorative, static three-dot progress indicator using Lucide
Circles and semantic primary tokens. Compose it inside a status region with
accessible loading copy; it does not announce or initiate requests on its own.
