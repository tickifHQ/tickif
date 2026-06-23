import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ProjectResponse } from '@repo/contracts';
import { ProjectCard } from '../../src/components/project-card';

const project: ProjectResponse = {
  id: '1',
  designerId: '2',
  title: 'Sunlit Bandra Apartment',
  slug: 'sunlit-bandra-apartment',
  description: null,
  status: 'published',
  propertyTypeSlug: null,
  scopeSlug: null,
  bhkSlug: null,
  sizeSqft: null,
  citySlug: 'mumbai',
  localitySlug: null,
  buildingName: null,
  budgetBandSlug: null,
  completedMonth: null,
  durationMonths: null,
  coverImageId: null,
  metadata: null,
  publishedAt: null,
  submittedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('ProjectCard', () => {
  it('renders the title and city · status', () => {
    render(
      <ul>
        <ProjectCard project={project} />
      </ul>,
    );
    expect(screen.getByText('Sunlit Bandra Apartment')).toBeInTheDocument();
    expect(screen.getByText(/mumbai · published/)).toBeInTheDocument();
  });

  it('falls back to "unknown city" when citySlug is null', () => {
    render(
      <ul>
        <ProjectCard project={{ ...project, citySlug: null }} />
      </ul>,
    );
    expect(screen.getByText(/unknown city · published/)).toBeInTheDocument();
  });
});
