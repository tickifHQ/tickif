import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ProjectDetailLoading from '../../../app/(public)/projects/[id]/loading';

describe('/projects/[id] loading state', () => {
  it('renders an accessible project-shaped skeleton', () => {
    render(<ProjectDetailLoading />);

    const loading = screen.getByRole('article', { name: 'Loading project' });
    expect(loading).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Loading project details')).toHaveClass('sr-only');
  });
});
