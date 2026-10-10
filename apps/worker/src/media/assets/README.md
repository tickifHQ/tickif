# Tickif watermark assets

Unmodified SVG exports from the [Figma watermark reference](https://www.figma.com/design/WJhOguDptAwt2735BS2WMG/tickif--DS-?node-id=15817-7985), frame `15817:7946`.

- `header-symbol.svg`: node `15817:7949`, 17.3176 × 17.4937, including shadow bounds.
- `header-wordmark.svg`: node `15817:7954`, 31.0898 × 14.4937. Its parent has 50% opacity.
- `center-symbol.svg`: node `16283:16704`, 20 × 21.
- `corner-symbol.svg`: node `15817:7969`, 20 × 21.

The center and corner exports have different opacity values. Preserve the files
and native dimensions; `watermark.ts` positions and scales their containers.
The build copies this directory to `dist/assets` for the production worker.
