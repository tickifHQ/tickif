import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cache } from 'react';
import { companyPages } from './company-pages';
import { getCompanySections } from './company-sections';

export const getCompanyPage = cache(async (slug: string) => {
  // Resolve only registry entries, never a user-supplied filename.
  const page = companyPages.find((entry) => entry.slug === slug);
  if (!page) return null;
  const content = (
    await readFile(join(process.cwd(), 'content', 'company', `${page.slug}.md`), 'utf8')
  ).trim();
  if (!content) throw new Error(`Empty company page: ${page.slug}`);
  return {
    ...page,
    content,
    sections: getCompanySections(content),
    readingMinutes: Math.max(1, Math.ceil(content.split(/\s+/).length / 220)),
  };
});
