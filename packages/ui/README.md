# @repo/ui

Tickif design system: themeable tokens + shadcn-style components (Tailwind v4, Radix).

Figma reference: [tickif- DS](https://www.figma.com/design/WJhOguDptAwt2735BS2WMG/tickif--DS-?node-id=14339-7048). Current token values are placeholders pending sync with the Figma file.

## Token architecture

Three layers, each swappable without touching the one below:

1. **Theme values** — `src/styles/themes/*.css`. Each theme defines semantic CSS variables (`--primary`, `--font-body`, `--radius`, …) scoped to `[data-theme='<name>']`, with dark-mode overrides under `.dark`. The default theme (`tickif`) is also bound to `:root`.
2. **Tailwind bridge** — `@theme inline` in `src/styles/globals.css` maps semantic variables to Tailwind utilities (`bg-primary`, `font-display`, `rounded-lg`, …).
3. **Components** — `src/components/*` use only the bridged utilities, never raw values. Restyling the app = editing a theme file.

### Tokens

- **Surfaces:** `background`, `card`, `popover` (+ `-foreground`)
- **Intent:** `primary`, `secondary`, `muted`, `accent`, `destructive`, `success`, `warning`, `info` (+ `-foreground`)
- **Chrome:** `border`, `input`, `ring`, `radius`
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

When the Figma DS stabilizes, update only `themes/tickif.css` (colors, radius) and the font loaders in `apps/web/app/layout.tsx`. Token names are the stable contract — components shouldn't need changes.

## Adding components

Run from `apps/web` (or this package — both have `components.json`):

```sh
pnpm dlx shadcn@latest add <component>
```

Generated components land in `src/components/` and already consume the semantic tokens. A live showcase of everything lives at `/design-system` in the web app.
