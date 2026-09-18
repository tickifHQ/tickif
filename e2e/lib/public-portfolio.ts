import { db, schema } from '@repo/db';

type PublicPortfolioFixture = {
  profileId: string;
  portfolioSlug: string;
  tagline?: string;
};

/** Creates the portfolio row required for a designer fixture to be publicly reachable. */
export async function makePublicPortfolio({
  profileId,
  portfolioSlug,
  tagline = 'Thoughtful spaces designed for real life',
}: PublicPortfolioFixture) {
  const [portfolio] = await db
    .insert(schema.designerPortfolio)
    .values({
      profileId,
      portfolioSlug,
      tagline,
      publicLinkEnabled: true,
    })
    .returning();

  return portfolio!;
}
