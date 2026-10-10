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
- **Intent:** `primary`, `secondary`, `muted`, `accent`, `destructive`, `success`, `warning`, `info`, `feature` (+ `-foreground` where needed, plus lighter state surfaces)
- **Chrome:** `border`, `input`, `ring`, `radius`
- **Control geometry:** `rounded-lg` (12px), `rounded-card` (22px),
  `rounded-feature` (36px), `rounded-popover` (16px), `rounded-checkbox` (5px)
- **Typography:** `text-display` (responsive display), `text-section` (32px),
  `text-metadata` (10px, spaced mono metadata)
- **Profile surfaces:** `surface-subtle`, `surface-inverse` (+ foreground),
  `foreground-secondary`, `foreground-subtle` (decorative), `overlay`, `rating`
- **Buttons:** `button-neutral`, `button-inverted`, `button-fancy` (+ foreground, hover, shadow tokens)
- **Charts:** `chart-1` … `chart-5`
- **Fonts:** `--font-body` → `font-sans`, `--font-heading` → `font-display`, `--font-code` → `font-mono`

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

- `ToggleGroup` / `ToggleGroupItem` and `Toggle` use shadcn/Radix primitives,
  shared intent tokens and keyboard focus styles. Single groups expose radio
  semantics and multiple groups expose pressed-button semantics. The visitor
  preference form uses a single group for home type.
- `bg-visitor-welcome` maps to the Figma visitor onboarding gradient in the
  Tickif theme. It is an inverse panel and requires inverse foreground tokens.

- `Button`: `shape="pill"` is the default; `shape="rounded"` opts into control
  corners. `variant="soft"` supports inverse sections. `size="lg"` is 50px,
  `size="xl"` is 64px; `icon-sm` is 32px. Existing compact/fancy sizes remain.
  Native button type and `asChild` behavior are preserved; callers still specify
  `type="button"` for non-submit actions.
- `Card`: default radius is `card`; `radius="feature"`, `variant="subtle"`, and
  `variant="inverse"` support profile surfaces. Existing variants/radii remain.
  Inverse cards require inverse foreground utilities for descriptions/actions.
- `Badge`: `variant="soft"` joins the existing status-chip variants.
- `Select`: shadcn/Radix compound primitive with shared trigger, popup and option
  tokens. [API](https://www.radix-ui.com/primitives/docs/components/select).
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
