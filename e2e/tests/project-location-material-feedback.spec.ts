import '../lib/environment';
import { expect, test } from '@playwright/test';
import { db, eq, inArray, schema } from '@repo/db';
import {
  createLocationResponseSchema,
  projectDetailResponseSchema,
  listProjectImagesResponseSchema,
} from '@repo/contracts';
import { createProjectVersionFixture } from '../lib/project-version-fixtures';
import { moderationApiUrl, signInProjectAdmin } from '../lib/project-moderation-fixtures';
import { webUrl } from '../lib/environment';

test('custom city and area, commercial Hospital and material finish persist through the editor', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  const fixture = await createProjectVersionFixture();
  const { target } = fixture;
  let locationIds: string[] = [];
  try {
    await db
      .update(schema.project)
      .set({ status: 'draft' })
      .where(eq(schema.project.id, target.id));
    await signInProjectAdmin(context, fixture.owner.phoneNumber);
    expect(
      (
        await context.request.post(`${moderationApiUrl}/api/auth/organization/set-active`, {
          headers: { origin: webUrl },
          data: { organizationId: fixture.organization.id },
        })
      ).ok(),
    ).toBeTruthy();
    await page.goto(`/designer/projects/upload?projectId=${target.id}`);
    await page.getByRole('button', { name: 'Office / Commercial', exact: true }).click();
    await page.getByRole('combobox', { name: 'Commercial type', exact: true }).click();
    await page.getByRole('option', { name: 'Hospital', exact: true }).click();
    await page.getByRole('button', { name: /enter a custom city/i }).click();
    const cityLabel = `Feedback City ${target.id.slice(0, 8)}`;
    await page.getByLabel('City', { exact: true }).fill(cityLabel);
    await page.getByLabel('Locality / Area', { exact: true }).fill('New Area');
    await page.getByRole('combobox', { name: 'Material & finish', exact: true }).first().click();
    await page.getByRole('option', { name: 'Lacquered glass', exact: true }).click();
    const savedLocation = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/taxonomy/locations') &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Save as draft', exact: true }).click();
    const location = createLocationResponseSchema.parse(await (await savedLocation).json());
    locationIds = [location.city.id, ...(location.locality ? [location.locality.id] : [])];
    await expect
      .poll(async () => {
        const response = await context.request.get(`${moderationApiUrl}/api/projects/${target.id}`);
        const project = projectDetailResponseSchema.parse(await response.json());
        return [
          project.citySlug,
          project.localitySlug,
          project.propertyTypeSlug,
          project.propertySubtypeSlug,
        ];
      })
      .toEqual([location.city.slug, location.locality?.slug, 'commercial-workspace', 'hospital']);
    const images = await context.request.get(
      `${moderationApiUrl}/api/projects/${target.id}/images`,
    );
    expect(listProjectImagesResponseSchema.parse(await images.json()).items[0]).toMatchObject({
      materialSlugs: ['lacquered-glass'],
      finishSlugs: ['lacquered-glass'],
    });
    await page.reload();
    await expect(page.getByRole('combobox', { name: 'City', exact: true })).toHaveText(cityLabel);
    await expect(page.getByRole('combobox', { name: 'Locality / Area', exact: true })).toHaveText(
      'New Area',
    );
    await expect(page.getByRole('combobox', { name: 'Commercial type', exact: true })).toHaveText(
      'Hospital',
    );
    const cities = await context.request.get(`${moderationApiUrl}/api/taxonomy/terms?kind=city`);
    expect((await cities.json()).terms).toEqual(expect.arrayContaining([location.city]));
  } finally {
    await fixture.cleanup();
    // Delete the city-scoped child before its parent; never touch seeded vocabulary.
    if (locationIds.length) {
      await db.delete(schema.taxonomy).where(inArray(schema.taxonomy.id, locationIds.slice(1)));
      await db.delete(schema.taxonomy).where(eq(schema.taxonomy.id, locationIds[0]!));
    }
  }
});
