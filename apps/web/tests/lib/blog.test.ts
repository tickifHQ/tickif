import { describe, expect, it } from 'vitest';
import { parseBlogPost, getBlogPost, getBlogPosts } from '../../src/lib/blog';

const article = `---
title: "Planning a design brief"
description: "A practical starting point."
publishedAt: "2026-09-22"
draft: false
---

## Start with your space

List what works and what does not.
`;

describe('Markdown blog content', () => {
  it('parses validated metadata and Markdown body', () => {
    expect(parseBlogPost('planning-a-design-brief', article)).toMatchObject({
      slug: 'planning-a-design-brief',
      title: 'Planning a design brief',
      content: expect.stringContaining('## Start with your space'),
    });
  });

  it('rejects invalid metadata and unsafe slugs', () => {
    expect(() => parseBlogPost('invalid', '---\ntitle: "No date"\n---\nBody')).toThrow();
    expect(() => parseBlogPost('../secrets', article)).toThrow();
    expect(() => parseBlogPost('bad%2Fslug', article)).toThrow();
  });

  it('lists published files but does not expose drafts or path traversal', async () => {
    const posts = await getBlogPosts();
    expect(posts.some((post) => post.slug === 'preparing-for-a-designer-conversation')).toBe(true);
    expect(posts.every((post) => !post.draft)).toBe(true);
    expect(await getBlogPost('../secrets')).toBeNull();
    expect(await getBlogPost('missing-post')).toBeNull();
  });
});
