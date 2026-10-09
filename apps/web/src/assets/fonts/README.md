# Portfolio social-image fonts

These static TTF fonts are used by the portfolio OG renderer. The browser retains
its existing `next/font` loaders. Licenses are included alongside the files.

Downloaded from Google Fonts on 2026-10-09:

- Inter Regular and Bold: `https://fonts.googleapis.com/css?family=Inter:400,700&subset=latin-ext`
- JetBrains Mono Regular: `https://fonts.googleapis.com/css?family=JetBrains+Mono:400`

The Inter Latin Extended files include U+20B9 (Indian rupee), needed for budgets.
Use static TTF/WOFF for Satori, not the browser's WOFF2 assets. Keep the explicit
`/d/*/social-card` font trace in `next.config.ts` when replacing these files.
