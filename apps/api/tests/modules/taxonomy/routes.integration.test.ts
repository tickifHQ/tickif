import { describe, it, expect } from 'vitest';
import { db, schema } from '@repo/db';
import { app } from '../../../src/app.js';

/**
 * E-31 Taxonomy public read integration tests.
 * Tests against real DB with the full HTTP path.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function json(res: Response): Promise<any> {
  return res.json();
}

async function get(path: string): Promise<Response> {
  return app.request(path, { method: 'GET' });
}

/** Seed a taxonomy term. */
async function seed(kind: string, label: string, slug: string, opts?: { parentId?: string; sortOrder?: number; isActive?: boolean }) {
  const [row] = await db
    .insert(schema.taxonomy)
    .values({
      kind: kind as typeof schema.taxonomyKindEnum.enumValues[number],
      label,
      slug,
      parentId: opts?.parentId ?? undefined,
      sortOrder: opts?.sortOrder ?? 0,
      isActive: opts?.isActive ?? true,
    })
    .returning();
  return row!;
}

describe('GET /api/taxonomy/terms (E-31)', () => {
  // --- Happy path ---

  it('returns active terms for a valid kind', async () => {
    await seed('city', 'Mumbai', 'mumbai');
    await seed('city', 'Delhi', 'delhi');

    const res = await get('/api/taxonomy/terms?kind=city');
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.terms).toHaveLength(2);
    expect(body.terms[0]).toMatchObject({ label: expect.any(String), slug: expect.any(String), id: expect.any(String) });
  });

  // --- Empty table ---

  it('returns empty array when no terms exist for kind', async () => {
    const res = await get('/api/taxonomy/terms?kind=bhk');
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.terms).toEqual([]);
  });

  // --- Inactive terms excluded ---

  it('excludes inactive terms', async () => {
    await seed('room', 'Kitchen', 'kitchen', { isActive: true });
    await seed('room', 'Attic', 'attic', { isActive: false });

    const res = await get('/api/taxonomy/terms?kind=room');
    const body = await json(res);
    expect(body.terms).toHaveLength(1);
    expect(body.terms[0].label).toBe('Kitchen');
  });

  // --- Unknown kind ---

  it('returns empty array for unknown kind', async () => {
    const res = await get('/api/taxonomy/terms?kind=garbage');
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.terms).toEqual([]);
  });

  // --- Missing kind ---

  it('returns empty array when kind param is missing', async () => {
    const res = await get('/api/taxonomy/terms');
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.terms).toEqual([]);
  });

  // --- Invalid parentId UUID format ---

  it('returns 422 for invalid parentId format', async () => {
    const res = await get('/api/taxonomy/terms?kind=locality&parentId=not-a-uuid');
    expect(res.status).toBe(422);
  });

  // --- Locality filtering ---

  it('filters localities by parentId', async () => {
    const city = await seed('city', 'Chennai', 'chennai');
    await seed('locality', 'T Nagar', 't-nagar', { parentId: city.id });
    await seed('locality', 'Adyar', 'adyar', { parentId: city.id });

    const otherCity = await seed('city', 'Kolkata', 'kolkata');
    await seed('locality', 'Salt Lake', 'salt-lake', { parentId: otherCity.id });

    const res = await get(`/api/taxonomy/terms?kind=locality&parentId=${city.id}`);
    const body = await json(res);
    expect(body.terms).toHaveLength(2);
    expect(body.terms.map((t: { slug: string }) => t.slug)).toContain('t-nagar');
    expect(body.terms.map((t: { slug: string }) => t.slug)).toContain('adyar');
  });

  // --- Locality without parentId returns all ---

  it('returns all active localities when parentId is not provided', async () => {
    const city1 = await seed('city', 'Jaipur', 'jaipur');
    const city2 = await seed('city', 'Lucknow', 'lucknow');
    await seed('locality', 'Malviya Nagar', 'malviya-nagar', { parentId: city1.id });
    await seed('locality', 'Gomti Nagar', 'gomti-nagar', { parentId: city2.id });

    const res = await get('/api/taxonomy/terms?kind=locality');
    const body = await json(res);
    // Should include localities from both cities
    expect(body.terms.length).toBeGreaterThanOrEqual(2);
  });

  // --- Non-existent parentId ---

  it('returns empty for locality with non-existent parentId', async () => {
    const res = await get('/api/taxonomy/terms?kind=locality&parentId=11111111-1111-4111-8111-111111111111');
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.terms).toEqual([]);
  });

  // --- parentId ignored for non-locality ---

  it('ignores parentId for non-locality kinds', async () => {
    await seed('theme', 'Minimalist', 'minimalist');

    const res = await get('/api/taxonomy/terms?kind=theme&parentId=11111111-1111-4111-8111-111111111111');
    const body = await json(res);
    // Should return themes regardless of parentId
    expect(body.terms.length).toBeGreaterThanOrEqual(1);
  });

  // --- Sort order with tie-break ---

  it('orders by sortOrder ASC then label ASC (tie-break)', async () => {
    await seed('scope', 'Modular Kitchen', 'modular-kitchen', { sortOrder: 10 });
    await seed('scope', 'Full Home', 'full-home', { sortOrder: 10 });
    await seed('scope', 'Bathroom', 'bathroom', { sortOrder: 5 });

    const res = await get('/api/taxonomy/terms?kind=scope');
    const body = await json(res);
    const labels = body.terms.map((t: { label: string }) => t.label);

    // sortOrder 5 first, then sortOrder 10 alphabetically
    expect(labels[0]).toBe('Bathroom');
    expect(labels[1]).toBe('Full Home');
    expect(labels[2]).toBe('Modular Kitchen');
  });

  // --- Cache header ---

  it('includes Cache-Control header with 7-day max-age', async () => {
    const res = await get('/api/taxonomy/terms?kind=city');
    expect(res.headers.get('cache-control')).toBe(
      'public, max-age=604800, stale-while-revalidate=86400',
    );
  });

  // --- Slug returned correctly ---

  it('returns correct slug in response', async () => {
    await seed('property_type', 'Apartment', 'apartment');

    const res = await get('/api/taxonomy/terms?kind=property_type');
    const body = await json(res);
    expect(body.terms[0]).toMatchObject({ label: 'Apartment', slug: 'apartment' });
  });
});
