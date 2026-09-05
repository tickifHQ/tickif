import { expect, test } from '@playwright/test';
import {
  bootstrapSearch,
  deleteSearchDocument,
  upsertSearchDocument,
  type ProjectSearchDocument,
} from '@repo/search';

const SEARCH_TERM = 'e208playwright';
const PROJECT_COUNT = 26;

const projectDocuments: ProjectSearchDocument[] = Array.from(
  { length: PROJECT_COUNT },
  (_, index) => ({
    id: `e2080000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    slug: `e208-playwright-project-${index + 1}`,
    title: `E208Playwright Project ${String(index + 1).padStart(2, '0')}`,
    description: 'Deterministic homepage search and pagination fixture.',
    designerId: 'e2080000-0000-4000-8000-000000000000',
    designerSlug: 'e208-playwright-studio',
    designerName: 'E208 Playwright Studio',
    citySlug: 'mumbai',
    localitySlug: null,
    propertyTypeSlug: 'apartment',
    propertySubtypeSlug: null,
    scopeSlug: 'full-home',
    bhkSlug: '3-bhk',
    budgetBandSlug: '15l-35l',
    sizeSqft: 1200,
    themes: ['modern'],
    materials: [],
    finishes: [],
    roomSlugs: ['living-room'],
    roomLabels: ['Living Room'],
    tags: [SEARCH_TERM],
    coverImageKey: null,
    publishedAt: 1_700_000_000_000 + index,
    featuredAt: null,
    avgRating: 4.5,
    reviewCount: 10,
  }),
);

test.describe('homepage search feed', () => {
  test.beforeAll(async () => {
    await bootstrapSearch();
    await Promise.all(
      projectDocuments.map((document) => upsertSearchDocument('projects', document)),
    );
  });

  test.afterAll(async () => {
    await Promise.all(
      projectDocuments.map((document) => deleteSearchDocument('projects', document.id)),
    );
  });

  test('searches from suggestions and loads the next result page', async ({ page }) => {
    await page.goto('/');
    const search = page.getByRole('search');
    const searchbox = search.getByRole('searchbox', { name: 'Search homes' });

    await searchbox.fill(SEARCH_TERM);
    await expect(page.getByRole('group', { name: 'Search suggestions' })).toBeVisible();
    await expect(
      page.getByRole('link', { name: /^E208Playwright Project \d{2}/ }).first(),
    ).toBeVisible();

    const nextPageResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === '/api/search' &&
        url.searchParams.get('q') === SEARCH_TERM &&
        url.searchParams.get('page') === '2'
      );
    });
    await search.getByRole('button', { name: 'Explore' }).click();
    await expect(page).toHaveURL(`/?q=${SEARCH_TERM}`);
    await expect(page.getByRole('heading', { name: `Results for “${SEARCH_TERM}”` })).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const response = await nextPageResponse;
    expect(response.ok()).toBeTruthy();
    const result = await response.json();
    expect(result.hits).toHaveLength(PROJECT_COUNT - 24);
    await expect(page.getByRole('article')).toHaveCount(PROJECT_COUNT);
    await expect(page.locator('[data-feed-page="2"]')).toHaveCount(PROJECT_COUNT - 24);
    await expect(page).toHaveURL(`/?q=${SEARCH_TERM}`);
  });

  test('walks back from a deep-linked result page with the pagination control', async ({
    page,
  }) => {
    await page.goto(`/?q=${SEARCH_TERM}&page=2`);

    const pagination = page.getByRole('navigation', { name: 'Feed pages' });
    await expect(pagination).toBeVisible();
    await expect(pagination.getByText('Page 2')).toBeVisible();
    // 26 fixtures at 24 per page: page 2 is the last page.
    await expect(pagination.getByRole('link', { name: 'Next page' })).toHaveCount(0);

    // Reachable by keyboard, not just by pointer.
    const previous = pagination.getByRole('link', { name: 'Previous page' });
    await previous.focus();
    await expect(previous).toBeFocused();
    await previous.press('Enter');

    await expect(page).toHaveURL(`/?q=${SEARCH_TERM}`);
    await expect(page.getByRole('article')).toHaveCount(24);
  });
});
