import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PublicProjectRecommendations } from '../../src/components/public-project-recommendations';
import { makePublicProject, makeRecommendationProject } from '../fixtures/public-project';

describe('PublicProjectRecommendations', () => {
  it('renders the three sourced recommendation groups and their existing routes', () => {
    const moreFromDesigner = makeRecommendationProject();
    const sameBudget = makeRecommendationProject({
      id: '88888888-8888-4888-8888-888888888888',
      title: 'Maximalist Color Story',
      studio: 'Color House',
      rating: 4.8,
    });
    const nearby = makeRecommendationProject({
      id: '99999999-9999-4999-8999-999999999999',
      title: 'Heritage Pooja Home',
      locality: 'Mylapore',
      rating: 4.9,
    });
    const project = makePublicProject({
      recommendations: {
        moreFromDesigner: [moreFromDesigner],
        sameBudgetDifferentStyle: [sameBudget],
        nearby: [nearby],
      },
    });

    render(<PublicProjectRecommendations project={project} />);

    expect(screen.getByRole('heading', { name: 'More from Anika Spaces' })).toBeInTheDocument();
    expect(screen.getByText('1 other home by this studio')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Full portfolio/ })).toHaveAttribute(
      'href',
      '/d/anika-spaces',
    );
    expect(screen.getByRole('link', { name: /Browse budget/ })).toHaveAttribute(
      'href',
      '/?budgetBand=12-18l',
    );
    expect(screen.getByRole('link', { name: /All in Chennai/ })).toHaveAttribute(
      'href',
      '/?city=chennai',
    );
    expect(screen.getByText('Other looks in the ₹12–18L band')).toBeInTheDocument();
    expect(screen.getByText('More homes around Mylapore')).toBeInTheDocument();
    expect(screen.getByText('Maximalist Color Story').closest('a')).toHaveAttribute(
      'href',
      `/projects/${sameBudget.id}`,
    );
    expect(screen.getAllByText('4.8').length).toBeGreaterThan(0);
  });

  it('omits empty groups and returns no wrapper when every group is empty', () => {
    const { rerender } = render(
      <PublicProjectRecommendations
        project={makePublicProject({
          recommendations: {
            moreFromDesigner: [makeRecommendationProject()],
            sameBudgetDifferentStyle: [],
            nearby: [],
          },
        })}
      />,
    );

    expect(screen.getByRole('heading', { name: 'More from Anika Spaces' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Same budget · different style' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'In Chennai' })).toBeNull();

    rerender(<PublicProjectRecommendations project={makePublicProject()} />);
    expect(screen.queryByRole('region', { name: 'Related projects' })).toBeNull();
  });
});
