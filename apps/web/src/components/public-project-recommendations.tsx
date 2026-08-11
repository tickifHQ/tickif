import Link from 'next/link';
import type { DesignerProjectCard, PublicProjectDetailResponse } from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import { ArrowRight } from 'lucide-react';
import { PublicProjectCard } from '@/components/public-project-card';
import { feedPageHref } from '@/lib/feed-params';
import { formatCompactBudgetLabel } from '@/lib/format-budget-label';

type RecommendationGroupProps = {
  actionHref: string | null;
  actionLabel: string;
  description: string;
  headingId: string;
  projects: DesignerProjectCard[];
  title: string;
};

function RecommendationGroup({
  actionHref,
  actionLabel,
  description,
  headingId,
  projects,
  title,
}: RecommendationGroupProps) {
  if (projects.length === 0) return null;

  return (
    <section aria-labelledby={headingId}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id={headingId} className="text-xl font-normal tracking-tight">
            {title}
          </h2>
          <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
        {actionHref ? (
          <Button asChild variant="ghost" size="compact">
            <Link href={actionHref}>
              {actionLabel}
              <ArrowRight aria-hidden data-icon="inline-end" />
            </Link>
          </Button>
        ) : null}
      </header>

      <div className="mt-3.5 flex gap-6 overflow-x-auto pb-2">
        {projects.map((recommendedProject) => (
          <div key={recommendedProject.id} className="w-72 shrink-0 sm:w-80 lg:w-96">
            <PublicProjectCard
              project={recommendedProject}
              studioName={recommendedProject.studio}
              presentation="recommendation"
              destination="project"
              showRating
            />
          </div>
        ))}
      </div>
    </section>
  );
}

export function PublicProjectRecommendations({
  project,
}: {
  project: PublicProjectDetailResponse;
}) {
  const { recommendations, specifications, designer } = project;
  const recommendationCount =
    recommendations.moreFromDesigner.length +
    recommendations.sameBudgetDifferentStyle.length +
    recommendations.nearby.length;

  if (recommendationCount === 0) return null;

  const budget = specifications.budgetBand;
  const city = specifications.city;
  const locality = specifications.locality;

  return (
    <section aria-label="Related projects" className="mt-14 border-t pb-8 pt-9">
      <div className="flex flex-col gap-12 px-3">
        <RecommendationGroup
          headingId="more-from-designer-heading"
          title={`More from ${designer.displayName}`}
          description={`${recommendations.moreFromDesigner.length} other ${
            recommendations.moreFromDesigner.length === 1 ? 'home' : 'homes'
          } by this studio`}
          projects={recommendations.moreFromDesigner}
          actionHref={designer.slug ? `/d/${designer.slug}` : null}
          actionLabel="Full portfolio"
        />

        <RecommendationGroup
          headingId="same-budget-heading"
          title="Same budget · different style"
          description={
            budget
              ? `Other looks in the ${formatCompactBudgetLabel(budget.label)} band`
              : 'Other homes with a similar budget'
          }
          projects={recommendations.sameBudgetDifferentStyle}
          actionHref={budget ? feedPageHref({ budgetBand: budget.slug }, 1) : null}
          actionLabel="Browse budget"
        />

        <RecommendationGroup
          headingId="nearby-projects-heading"
          title={city ? `In ${city.label}` : 'Nearby projects'}
          description={
            locality
              ? `More homes around ${locality.label}`
              : city
                ? `More homes in ${city.label}`
                : 'More homes nearby'
          }
          projects={recommendations.nearby}
          actionHref={city ? feedPageHref({ city: city.slug }, 1) : null}
          actionLabel={city ? `All in ${city.label}` : 'Browse nearby'}
        />
      </div>
    </section>
  );
}
