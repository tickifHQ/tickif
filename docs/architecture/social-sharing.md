# Public sharing metadata

Every shareable public route supplies a title, description, absolute canonical URL,
Open Graph image and Twitter `summary_large_image` card. URLs use the configured
`NEXT_PUBLIC_WEB_URL`; portfolio canonical URLs remain the API's configured
`PUBLIC_WEB_URL`. These origins must describe the same public deployment.

| Page                                                      | Image endpoint                    | Card content                                                  | Indexing                                         |
| --------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------- | ------------------------------------------------ |
| `/` (including canonical feed query/page)                 | `/social-card`                    | Branded homepage message                                      | Index                                            |
| `/designers` (including canonical directory filters/page) | `/designers/social-card`          | Designer discovery                                            | Index                                            |
| `/d/{slug}`                                               | `/d/{canonical-slug}/social-card` | Public studio identity, project count and visible trust facts | Index; aliases redirect                          |
| `/projects/{id}`                                          | `/projects/{id}/social-card`      | Published title, cover, studio, location and property type    | Index while public; unavailable response noindex |
| `/image/{id}`                                             | `/image/{id}/social-card`         | That published image, room label, parent project and studio   | Index while public                               |
| `/blog`                                                   | `/blog/social-card`               | Journal introduction                                          | Index                                            |
| `/blog/{slug}`                                            | `/blog/{slug}/social-card`        | Published article title and description                       | Index while published                            |

Image details deliberately have their own card, rather than sharing a parent
project cover. The image-view sidebar also displays the resolved property
subtype (or type) and supplied positive floor area from its public API response.
These facts do not require opening the full project. Unknown values stay absent.
The project overview repeats the saved locality, property subtype (or type) and
positive floor area beside its title. Selecting another photo updates the image
and browser history in place, preserving the surrounding page, scroll and focus.
Back and Forward restore the selected photo. Direct loads and reloads resolve
the selected image's server metadata and sharing card.
Unknown/private projects, images, portfolios and articles return
404 from their card endpoint. Recoverable unavailable projects keep their existing
noindex page but have no generated image. API failures remain failures; they do not
silently turn private or stale data into shareable content.

Cards embed only media returned by the anonymous public API. The renderer accepts
only the configured storage origin, rejects redirects, limits requests to five
seconds/six MiB and decodes raster images with a pixel limit. It converts WebP/AVIF
derivatives to PNG before Satori embeds them. Broken/missing/unsupported media
uses text or initials. Logos use proportional containment; stored crops are not
rewritten. Expiring storage signatures never appear in metadata image URLs.

Portfolio social images reproduce the page's sharing card, straightened for OG: a white grid
surface, studio logo/name/type/location, two-column facts, arched portfolio cover,
Tickif ticket and canonical portfolio address. The straight card fills the 1200×630
canvas, with transparent rounded corners and no outer margins, backdrop, decoration
or drop shadow. The card retains its accent details. Statistics cells draw each
shared edge once, matching the page's single-pixel dividers.
`portfolioShareFacts` supplies both renderers so rating precedence, optional facts
and visibility flags stay identical. The OG renderer uses Satori-compatible flex
layout at 1200×630; it does not include the adjacent sharing instructions or CTA.
Both the logo and cover pass through the restricted media embedding helper.
If either cannot be embedded, the card uses initials or expands the facts area.

The portfolio image loads local OFL Inter and JetBrains Mono TTFs from
`apps/web/src/assets/fonts/`, included explicitly in the standalone route trace.
Inter includes the Latin Extended subset for the rupee glyph. These match the
page's font families without a font-CDN dependency during image generation.

Content cards and their API reads use `no-store`. API requests also send
`Cache-Control: no-cache` to require intermediary revalidation of any previously
cached public response. Edits, unpublishing and visibility changes therefore apply
on the next request without a separate invalidation service; reverse proxies must
honor those HTTP cache directives. Static branded cards cache for at most one hour and then revalidate.
Social providers can retain their own preview copies; a provider preview refresh
may still be needed after a change.

`e2e/tests/social-metadata.spec.ts` checks anonymous metadata, actual PNG dimensions,
all seven route families, missing-media fallback and immediate unpublishing. It
records browser screenshots and video into the existing critical E2E artifact.
Provider-specific staging previews require the PR to be deployed to a public URL.
