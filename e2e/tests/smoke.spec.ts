import { test, expect } from '@playwright/test';

const API_URL = 'http://localhost:3001';

// Full-stack smoke: proves web + api + DB boot together and serve.
// (The authenticated write path is covered at the API integration layer; an
//  authed UI flow plugs in here once login UI exists, reusing the session helper.)

test('home page renders', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'tickif' }).first()).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Search homes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Trending projects' })).toBeVisible();
});

test('api is healthy and protects the projects endpoint', async ({ request }) => {
  const health = await request.get(`${API_URL}/health`);
  expect(health.ok()).toBeTruthy();
  expect(await health.json()).toMatchObject({ status: 'ok' });

  const projects = await request.get(`${API_URL}/api/projects`);
  expect(projects.status()).toBe(401);
  await expect(projects.json()).resolves.toMatchObject({
    error: {
      code: 'unauthorized',
      message: 'Authentication required',
    },
  });
});

test('OpenAPI spec and Scalar docs are served', async ({ request, page }) => {
  const spec = await request.get(`${API_URL}/openapi.json`);
  expect(spec.ok()).toBeTruthy();
  expect((await spec.json()).openapi).toBe('3.1.0');

  await page.goto(`${API_URL}/docs`);
  await expect(page.locator('body')).toContainText(/./);
});
