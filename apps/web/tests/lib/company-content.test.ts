import { describe, expect, it } from 'vitest';
import { companyPages } from '../../src/lib/company-pages';
import { getCompanyPage } from '../../src/lib/company-content';
import { getCompanySections } from '../../src/lib/company-sections';

describe('Company Markdown content', () => {
  it('loads updated company documents with a consistent contact channel', async () => {
    for (const { slug, title } of companyPages) {
      expect(await getCompanyPage(slug)).toMatchObject({
        slug,
        title,
        content: expect.stringContaining('[Contact@tickif.com](mailto:Contact@tickif.com)'),
      });
      const page = await getCompanyPage(slug);
      expect(page?.content).not.toMatch(/draft|sample content|support email: pending/i);
      expect(page?.content).not.toContain('wa.me');
    }
  });

  it('publishes the supplied story and company location without inventing registration details', async () => {
    const page = await getCompanyPage('about');
    expect(page?.content).toContain('Real projects. The professionals behind them.');
    expect(page?.content).toContain('architecture, construction and interiors');
    expect(page?.content).toContain('Chennai, Tamil Nadu');
    expect(page?.content).toContain('Grievance officer');
    expect(page?.content).toContain('pending confirmation');
  });

  it.each(['\n', '\r\n'])(
    'indexes document sections with %j line endings without treating code examples as headings',
    (lineEnding) => {
      expect(
        getCompanySections(
          ['## First', '', '```md', '## Example', '```', '', '## First', '', '### Detail'].join(
            lineEnding,
          ),
        ),
      ).toEqual([
        { id: 'section-1', title: 'First' },
        { id: 'section-7', title: 'First' },
      ]);
    },
  );

  it.each(['missing', '../privacy', '../../.env', 'privacy%2F..', 'toString'])(
    'does not read files for an unregistered slug: %s',
    async (slug) => {
      expect(await getCompanyPage(slug)).toBeNull();
    },
  );
});
