import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from '../../src/components/badge';

describe('Badge', () => {
  it('renders its content', () => {
    render(<Badge>Published</Badge>);

    expect(screen.getByText('Published')).toBeInTheDocument();
  });

  it('can render as a child element', () => {
    render(
      <Badge asChild>
        <a href="/tags/modern">Modern</a>
      </Badge>,
    );

    expect(screen.getByRole('link', { name: 'Modern' })).toHaveAttribute('href', '/tags/modern');
  });
});
