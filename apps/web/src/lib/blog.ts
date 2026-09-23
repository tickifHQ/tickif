import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import matter from 'gray-matter';
import { blogPostMetadataSchema, blogSlugSchema, type BlogPostMetadata } from '@repo/contracts';

const BLOG_DIRECTORY = join(process.cwd(), 'content', 'blog');

export type BlogPost = BlogPostMetadata & { slug: string; content: string };

/** Only a validated filename slug can be resolved into the content directory. */
export function parseBlogPost(slug: string, source: string): BlogPost {
  const parsedSlug = blogSlugSchema.safeParse(slug);
  if (!parsedSlug.success) throw new Error('Invalid blog slug');

  const document = matter(source);
  const metadata = blogPostMetadataSchema.safeParse(document.data);
  if (!metadata.success) throw new Error(`Invalid blog metadata: ${slug}`);
  const content = document.content.trim();
  if (!content) throw new Error(`Empty blog post: ${slug}`);

  return { slug: parsedSlug.data, ...metadata.data, content };
}

export async function getBlogPost(slug: string): Promise<BlogPost | null> {
  if (!blogSlugSchema.safeParse(slug).success) return null;
  let source: string;
  try {
    source = await readFile(join(BLOG_DIRECTORY, `${slug}.md`), 'utf8');
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
  const post = parseBlogPost(slug, source);
  return post.draft ? null : post;
}

export async function getBlogPosts(): Promise<BlogPost[]> {
  let filenames: string[];
  try {
    filenames = await readdir(BLOG_DIRECTORY);
  } catch (error) {
    if (isMissingFile(error)) return [];
    throw error;
  }

  const posts = await Promise.all(
    filenames
      .filter((name) => name.endsWith('.md'))
      .map(async (name) => {
        const slug = name.slice(0, -3);
        if (!blogSlugSchema.safeParse(slug).success) return null;
        return getBlogPost(slug);
      }),
  );
  return posts
    .filter((post): post is BlogPost => post !== null)
    .sort(
      (left, right) =>
        right.publishedAt.localeCompare(left.publishedAt) || left.slug.localeCompare(right.slug),
    );
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
