import { describe, expect, it } from 'vitest';
import { db } from '@repo/db';
import { makeDesigner } from '@repo/db/testing';
import { portfolioCompanyAboutSchema } from '@repo/contracts';
import { portfolioRepository } from '../../../src/modules/profiles/portfolio-repository.js';

describe('company portfolio persistence', () => {
  it('saves company copy without replacing the legacy testimonial', async () => {
    const profile = await makeDesigner();
    const aboutCompany = portfolioCompanyAboutSchema.parse({
      headline: 'Our company',
      story: 'A company built around people.',
      services: 'Full home interiors',
    });
    await db.transaction((tx) =>
      portfolioRepository.upsertInTx(tx, profile.id, {
        testimonialWords: 'A client quote',
        aboutCompany,
      }),
    );
    const saved = await portfolioRepository.findOrCreate(profile.id);
    expect(saved.aboutCompany).toEqual(aboutCompany);
    expect(saved.testimonialWords).toBe('A client quote');
    await db.transaction((tx) =>
      portfolioRepository.upsertInTx(tx, profile.id, { showAboutCompany: false }),
    );
    expect((await portfolioRepository.findOrCreate(profile.id)).aboutCompany).toEqual(aboutCompany);
  });
  it('updates each company photo independently and rejects a stale replacement', async () => {
    const profile = await makeDesigner();
    await db.transaction((tx) =>
      portfolioRepository.upsertInTx(tx, profile.id, { heroImageId: 'hero' }),
    );
    expect(
      await portfolioRepository.setCompanyImageIfMatch(
        profile.id,
        'founderImageId',
        null,
        'founder',
      ),
    ).toBe(true);
    expect(
      await portfolioRepository.setCompanyImageIfMatch(
        profile.id,
        'founderImageId',
        null,
        'stale-founder',
      ),
    ).toBe(false);
    expect(
      await portfolioRepository.setCompanyImageIfMatch(profile.id, 'studioImageId', null, 'studio'),
    ).toBe(true);
    expect(await portfolioRepository.findOrCreate(profile.id)).toMatchObject({
      heroImageId: 'hero',
      founderImageId: 'founder',
      studioImageId: 'studio',
    });
  });
});
