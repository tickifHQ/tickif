# @repo/ui

Tickif design system: themeable tokens + shadcn-style components (Tailwind v4, Radix).

Current refresh reference: [designer portfolio](https://www.figma.com/design/WJhOguDptAwt2735BS2WMG/tickif--DS-?node-id=15885-4108&m=dev).
The [Phase 1 specification](../../docs/design/ui-refresh/README.md) records
extracted tokens, component callers, local artwork, and inferred control states.
Runtime tokens remain the existing values until Phase 2 applies that specification.

## Token architecture

Three layers, each swappable without touching the one below:

1. **Theme values** — `src/styles/themes/*.css`. Each theme defines semantic CSS variables (`--primary`, `--font-body`, `--radius`, …) scoped to `[data-theme='<name>']`, with dark-mode overrides under `.dark`. The default theme (`tickif`) is also bound to `:root`.
2. **Tailwind bridge** — `@theme inline` in `src/styles/globals.css` maps semantic variables to Tailwind utilities (`bg-primary`, `font-display`, `rounded-lg`, …).
3. **Components** — `src/components/*` use only the bridged utilities, never raw values. Restyling the app = editing a theme file.

### Tokens

- **Surfaces:** `background`, `card`, `popover` (+ `-foreground`)
- **Intent:** `primary`, `secondary`, `muted`, `accent`, `destructive`, `success`, `warning`, `info`, `feature` (+ `-foreground` where needed, plus lighter state surfaces)
- **Chrome:** `border`, `input`, `ring`, `radius`
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

The app loads fonts (e.g. `next/font`) and exposes them as `--font-sans-base`, `--font-display-base`, `--font-mono-base` on `<body>`. Themes map those to the semantic font roles, so changing the brand font is a one-line change in `apps/web/app/layout.tsx`.

## Syncing from Figma

Follow the [phased handoff](../../docs/ui-refresh-handoff.md). Theme values live
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

Generated components land in `src/components/` and already consume the semantic tokens. A live showcase of everything lives at `/design-system` in the web app.
