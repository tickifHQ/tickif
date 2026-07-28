import { describe, expect, it } from 'vitest';
import { db, eq, schema } from '@repo/db';
import { makeDesigner, makeTaxonomy } from '@repo/db/testing';
import { portfolioRepository } from '../../../src/modules/profiles/portfolio-repository.js';
import { profilesRepository } from '../../../src/modules/profiles/repository.js';

describe('profile search projection events', () => {
  it('commits profile fields, footprint, and the projection event atomically', async () => {
    const designer = await makeDesigner({ status: 'active', displayName: 'Before' });
    const city = await makeTaxonomy({ kind: 'city', slug: 'pune', label: 'Pune' });

    await profilesRepository.updateProfileAndFootprint(
      designer.id,
      { displayName: 'After' },
      { cityIds: [city.id] },
    );

    const [profile, footprint, events] = await Promise.all([
      profilesRepository.findById(designer.id),
      profilesRepository.getFootprint(designer.id),
      db
        .select()
        .from(schema.searchProjectionOutbox)
        .where(eq(schema.searchProjectionOutbox.entityId, designer.id)),
    ]);
    expect(profile?.displayName).toBe('After');
    expect(footprint).toEqual([expect.objectContaining({ kind: 'city', slug: 'pune' })]);
    expect(events).toEqual([
      expect.objectContaining({
        entityKind: 'designer',
        operation: 'index',
      }),
    ]);
  });

  it('does not record a logo event when compare-and-set loses the race', async () => {
    const designer = await makeDesigner({
      status: 'active',
      logoImageId: 'originals/logos/current',
    });

    await expect(
      portfolioRepository.setLogoIfMatch(
        designer.id,
        'originals/logos/stale',
        'originals/logos/new',
      ),
    ).resolves.toBe(false);

    const events = await db
      .select()
      .from(schema.searchProjectionOutbox)
      .where(eq(schema.searchProjectionOutbox.entityId, designer.id));
    expect(events).toHaveLength(0);
  });

  it('persists a new profile timestamp for footprint-only updates', async () => {
    const designer = await makeDesigner({ status: 'active' });
    const oldUpdatedAt = new Date('2026-01-01T00:00:00.000Z');
    const city = await makeTaxonomy({ kind: 'city', slug: 'surat', label: 'Surat' });
    await db
      .update(schema.designerProfile)
      .set({ updatedAt: oldUpdatedAt })
      .where(eq(schema.designerProfile.id, designer.id));

    const updated = await profilesRepository.updateProfileAndFootprint(
      designer.id,
      {},
      { cityIds: [city.id] },
    );

    const [persisted] = await db
      .select({ updatedAt: schema.designerProfile.updatedAt })
      .from(schema.designerProfile)
      .where(eq(schema.designerProfile.id, designer.id));
    expect(updated.updatedAt.getTime()).toBeGreaterThan(oldUpdatedAt.getTime());
    expect(persisted?.updatedAt).toEqual(updated.updatedAt);
  });

  it('does not emit a projection event or fabricate a timestamp for an empty patch', async () => {
    const designer = await makeDesigner({ status: 'active' });

    const updated = await profilesRepository.updateProfileAndFootprint(designer.id, {}, {});

    const events = await db
      .select()
      .from(schema.searchProjectionOutbox)
      .where(eq(schema.searchProjectionOutbox.entityId, designer.id));
    expect(updated.updatedAt).toEqual(designer.updatedAt);
    expect(events).toHaveLength(0);
  });
});
