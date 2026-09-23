import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { getBlogPosts } from '@/lib/blog';

export const metadata: Metadata = {
  title: 'Journal | Tickif',
  description: 'Ideas and practical guides for planning a space with a designer.',
  alternates: { canonical: '/blog' },
};

export default async function BlogIndexPage() {
  const posts = await getBlogPosts();

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
      <header className="max-w-2xl">
        <p className="font-mono text-xs uppercase tracking-widest text-primary">Tickif journal</p>
        <h1 className="mt-3 font-display text-4xl tracking-tight sm:text-5xl">
          Ideas for your space
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          Practical reading for planning a project and working with a designer.
        </p>
      </header>
      {posts.length > 0 ? (
        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {posts.map((post) => (
            <article key={post.slug} className="rounded-2xl border border-border p-6">
              <time dateTime={post.publishedAt} className="text-sm text-muted-foreground">
                {new Intl.DateTimeFormat('en-IN', { dateStyle: 'long', timeZone: 'UTC' }).format(
                  new Date(`${post.publishedAt}T00:00:00Z`),
                )}
              </time>
              <h2 className="mt-3 font-display text-2xl leading-tight">
                <Link
                  className="hover:text-primary focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
                  href={`/blog/${post.slug}`}
                >
                  {post.title}
                </Link>
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {post.description}
              </p>
              <Link
                href={`/blog/${post.slug}`}
                className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                Read article <ArrowUpRight aria-hidden className="size-4" />
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-10 rounded-xl border border-border p-8 text-muted-foreground">
          No articles are published yet. Please check back soon.
        </p>
      )}
    </div>
  );
}
