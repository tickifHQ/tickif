import { describe, expect, it } from 'vitest';
import { companyPages } from '../../src/lib/company-pages';
import { getCompanyPage } from '../../src/lib/company-content';
import { getCompanySections } from '../../src/lib/company-sections';

describe('Company Markdown content', () => {
  it('loads each footer document with its publication status', async () => {
    for (const { slug, title } of companyPages) {
      expect(await getCompanyPage(slug)).toMatchObject({
        slug,
        title,
        content: expect.stringMatching(slug === 'about' ? /^> Sample / : /^> Draft /),
        status: slug === 'about' ? 'sample' : 'draft',
      });
    }
  });

  it('indexes document sections without treating code examples as headings', () => {
    expect(
      getCompanySections('## First\n\n```md\n## Example\n```\n\n## First\n\n### Detail'),
    ).toEqual([
      { id: 'section-1', title: 'First' },
      { id: 'section-7', title: 'First' },
    ]);
  });

  it.each(['missing', '../privacy', '../../.env', 'privacy%2F..', 'toString'])(
    'does not read files for an unregistered slug: %s',
    async (slug) => {
      expect(await getCompanyPage(slug)).toBeNull();
    },
  );
});
