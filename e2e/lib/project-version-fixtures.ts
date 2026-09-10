import { db, eq, schema } from '@repo/db';
import { createProjectModerationFixture } from './project-moderation-fixtures';

export async function createProjectVersionFixture() {
  const fixture = await createProjectModerationFixture({ projectCount: 1 });
  try {
    const project = fixture.projects[0]!;
    const title = `Approved living room ${project.id.slice(0, 8)}`;
    // Use the seeded upload vocabulary so saving the UI does not repair unrelated fields.
    await db
      .update(schema.project)
      .set({
        title,
        citySlug: 'mumbai',
        propertyTypeSlug: 'residential',
        propertySubtypeSlug: 'apartment',
        bhkSlug: '2-bhk',
        scopeSlug: 'design',
        budgetBandSlug: 'upscale',
        sizeSqft: 1500,
      })
      .where(eq(schema.project.id, project.id));
    return { ...fixture, target: { ...project, title } };
  } catch (error) {
    await fixture.cleanup();
    throw error;
  }
}
