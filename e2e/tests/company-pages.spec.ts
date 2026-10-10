import { expect, test } from '@playwright/test';

test('every Company footer link opens its Markdown document with an honest publication status', async ({
  page,
}) => {
  await page.goto('/');
  const footer = page.getByRole('contentinfo');
  for (const [title, slug] of [
    ['About', 'about'],
    ['Report a problem', 'report-a-problem'],
    ['Takedown policy', 'takedown-policy'],
    ['Terms', 'terms'],
    ['Privacy', 'privacy'],
  ] as const) {
    await expect(footer.getByRole('link', { name: title, exact: true })).toHaveAttribute(
      'href',
      `/company/${slug}`,
    );
  }
  // The prompt can be disabled by the environment or ineligible on short pages.
  // Exercise footer links both with and without an active scroll gate.
  await footer.scrollIntoViewIfNeeded();
  if (await page.getByTestId('scroll-signup-gate').count()) {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const gate = page.getByRole('dialog', { name: 'Sign in required' });
    await expect(gate).toBeVisible();
    await gate.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(gate).not.toBeVisible();
  }
  await footer.getByRole('link', { name: 'About', exact: true }).click();
  await expect(page).toHaveURL(/\/company\/about$/);
  for (const title of ['About', 'Report a problem', 'Takedown policy', 'Terms', 'Privacy']) {
    await page
      .getByRole('navigation', { name: 'Company pages' })
      .getByRole('link', { name: title, exact: true })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
    await expect(
      page.getByText(title === 'About' ? 'Sample document' : 'Draft for review', { exact: true }),
    ).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.getByRole('article')).toContainText(title === 'About' ? 'Sample' : 'pending');
    await expect(page.getByTestId('scroll-signup-gate')).toHaveCount(0);
  }
});

for (const width of [1512, 390, 320]) {
  test(`policy sections stay readable and navigable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    await page.goto('/company/privacy');
    const article = page.getByRole('article');
    await expect(article.getByRole('heading', { level: 1 })).toHaveText('Privacy');
    const navigation = page.getByRole('navigation', {
      name: width < 1024 ? 'Document sections' : 'On this page',
    });
    if (width < 1024) await page.locator('summary').filter({ hasText: 'On this page' }).click();
    await navigation.getByRole('link', { name: 'Choices and requests', exact: true }).click();
    const heading = article.getByRole('heading', { name: 'Choices and requests', exact: true });
    await expect(heading).toBeInViewport();
    const targetId = await heading.getAttribute('id');
    await expect(page).toHaveURL(new RegExp(`#${targetId}$`));
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await article.getByRole('link', { name: 'Back to top', exact: true }).click();
    await expect(article.getByRole('heading', { level: 1 })).toBeInViewport();
  });
}

test('drafts expose official sources without inventing a reporting endpoint', async ({ page }) => {
  await page.goto('/company/report-a-problem');
  const article = page.getByRole('article');
  await expect(article).toContainText('Support email: pending confirmation');
  await expect(
    article.getByRole('link', { name: 'WhatsApp support', exact: true }),
  ).toHaveAttribute('href', 'https://wa.me/919994645911');
  await expect(article.locator('form')).toHaveCount(0);
  await expect(article.getByRole('link', { name: '112 emergency service' })).toHaveAttribute(
    'href',
    'https://112.gov.in/',
  );
  await page
    .getByRole('navigation', { name: 'Company pages' })
    .getByRole('link', { name: 'Takedown policy' })
    .click();
  await expect(page.getByRole('article')).toContainText('within 2 hours');
  await expect(
    page.getByRole('link', { name: 'Intermediary Rules updated on 10 February 2026' }),
  ).toHaveAttribute('href', /meity\.gov\.in/);
});

test('reading login policies keeps entered authentication data in the original tab', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Log in', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Sign in to continue' });
  await dialog.getByRole('textbox', { name: 'Phone number' }).fill('9123456789');
  for (const title of ['Terms', 'Privacy']) {
    const newPage = context.waitForEvent('page');
    await dialog.getByRole('link', { name: title, exact: true }).click();
    const policy = await newPage;
    await expect(policy.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
    await policy.close();
    await expect(dialog.getByRole('textbox', { name: 'Phone number' })).toHaveValue('9123456789');
  }
});
