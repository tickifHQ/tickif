import { describe, expect, it } from 'vitest';
import { SEED_DESIGNERS } from '../../src/scripts/seed-demo/data.js';

const allProjects = SEED_DESIGNERS.flatMap((designer) => designer.projects);
const allImages = allProjects.flatMap((project) => project.images);

describe('seed-demo data matrix', () => {
  it('seeds at least 2 designers with 2 projects each', () => {
    expect(SEED_DESIGNERS.length).toBeGreaterThanOrEqual(2);
    for (const designer of SEED_DESIGNERS) {
      expect(designer.projects.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('has globally unique ids and slugs', () => {
    const ids = [
      ...SEED_DESIGNERS.flatMap((d) => [d.userId, d.orgId, d.memberId]),
      ...allProjects.map((p) => p.id),
      ...allImages.map((i) => i.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);

    const slugs = [...SEED_DESIGNERS.map((d) => d.orgSlug), ...allProjects.map((p) => p.slug)];
    expect(new Set(slugs).size).toBe(slugs.length);

    const phones = SEED_DESIGNERS.map((d) => d.phone);
    expect(new Set(phones).size).toBe(phones.length);
  });

  it('uses valid uuids for project and image ids', () => {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    for (const project of allProjects) expect(project.id).toMatch(uuidPattern);
    for (const image of allImages) expect(image.id).toMatch(uuidPattern);
  });

  it('gives every project enough publish-ready images', () => {
    for (const project of allProjects) {
      // Publish gate requires >= 3 ready photos (projects/service.ts).
      expect(project.images.length).toBeGreaterThanOrEqual(3);
      expect(project.roomSlugs.length).toBeGreaterThan(0);
    }
  });

  it('assigns every image to a declared room with themes and finishes', () => {
    for (const project of allProjects) {
      for (const image of project.images) {
        // Completeness scoring requires roomId + themeSlugs + finishSlugs per image.
        expect(project.roomSlugs).toContain(image.roomSlug);
        expect(image.themeSlugs.length).toBeGreaterThan(0);
        expect(image.finishSlugs.length).toBeGreaterThan(0);
      }
    }
  });

  it('references unique fixture files with well-formed unsplash photo ids', () => {
    // Fixtures are downloaded from images.unsplash.com and cached on first seed run.
    const files = allImages.map((image) => image.file);
    expect(new Set(files).size).toBe(files.length);
    for (const image of allImages) {
      expect(image.file).toMatch(/^[a-z0-9-]+\.jpg$/);
      expect(image.unsplashId).toMatch(/^\d{10,13}-[0-9a-f]{12}$/);
    }
  });
});
