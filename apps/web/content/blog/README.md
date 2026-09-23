# Blog content

Each published article is one `.md` file named with a lowercase hyphenated slug.
The frontmatter requires `title`, `description`, and an ISO `publishedAt` date.
Set `draft: true` to keep an article out of the index and direct URL. Example:

```md
---
title: 'An article title'
description: 'A short summary for cards and search results.'
publishedAt: '2026-09-22'
draft: true
---

## Heading

Markdown content goes here.
```

The rendering layer treats raw HTML as text and does not render embedded images.
The source can later be replaced by a separate repository or a CMS adapter while
preserving the validated metadata and the `/blog/[slug]` routes.
