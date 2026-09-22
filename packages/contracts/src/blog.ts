import { z } from 'zod';

/** Metadata shared by Markdown files and any future blog content adapter. */
export const blogPostMetadataSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(240),
    publishedAt: z.iso.date(),
    draft: z.boolean().default(false),
  })
  .meta({ id: 'BlogPostMetadata' });
export type BlogPostMetadata = z.infer<typeof blogPostMetadataSchema>;

export const blogSlugSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .meta({ id: 'BlogSlug' });
