import { describe, expect, it } from 'vitest';
import { db, schema, eq } from '@repo/db';
import { app } from '../../../src/app.js';
import { createRoleSession } from '../../helpers/auth.js';
import { createLocationResponseSchema, listTaxonomyResponseSchema } from '@repo/contracts';

function create(body: unknown, cookie?: string) {
  return app.request('/api/taxonomy/locations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}
describe('reusable city and locality creation', () => {
  it('requires a designer session', async () => {
    expect((await create({ cityLabel: 'New City' })).status).toBe(401);
    const { cookie } = await createRoleSession('+919812005001', 'visitor');
    expect((await create({ cityLabel: 'New City' }, cookie)).status).toBe(403);
  });
  it('reuses normalized names and scopes duplicate areas to their city', async () => {
    const { cookie } = await createRoleSession('+919812005002', 'designer');
    const input = { cityLabel: 'Pondicherry', localityLabel: 'New Area' };
    const response = await create(input, cookie);
    expect(response.status).toBe(200);
    const body = createLocationResponseSchema.parse(await response.json());
    expect(await (await create({ ...input, cityLabel: 'pondicherry' }, cookie)).json()).toEqual(
      body,
    );
    const other = createLocationResponseSchema.parse(
      await (await create({ ...input, cityLabel: 'Other City' }, cookie)).json(),
    );
    expect(other.locality!.id).not.toBe(body.locality!.id);
    expect(other.locality!.slug).toBe(body.locality!.slug);
    const cityRead = await app.request('/api/taxonomy/terms?kind=city');
    expect(cityRead.headers.get('Cache-Control')).toBe('no-store');
    const areas = await app.request(`/api/taxonomy/terms?kind=locality&parentId=${body.city.id}`);
    expect(listTaxonomyResponseSchema.parse(await areas.json()).terms).toEqual([body.locality]);
  });
  it('creates an area in an existing city and preserves inactive terms', async () => {
    const { cookie } = await createRoleSession('+919812005003', 'designer');
    const { city } = createLocationResponseSchema.parse(
      await (await create({ cityLabel: 'Chennai' }, cookie)).json(),
    );
    const response = await create({ citySlug: city.slug, localityLabel: 'New Area' }, cookie);
    expect(response.status).toBe(200);
    await db
      .update(schema.taxonomy)
      .set({ isActive: false })
      .where(eq(schema.taxonomy.id, city.id));
    expect((await create({ cityLabel: 'Chennai' }, cookie)).status).toBe(409);
    expect(
      (await create({ citySlug: city.slug, localityLabel: 'Another Area' }, cookie)).status,
    ).toBe(422);
  });
  it('validates labels and mutually exclusive city inputs', async () => {
    const { cookie } = await createRoleSession('+919812005004', 'designer');
    for (const input of [
      {},
      { cityLabel: '!!!' },
      { cityLabel: 'x'.repeat(101) },
      { cityLabel: 'City', citySlug: 'city' },
    ]) {
      expect((await create(input, cookie)).status).toBe(422);
    }
    expect((await create({ cityLabel: 'சென்னை' }, cookie)).status).toBe(200);
  });
});
