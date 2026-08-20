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

  it('supports compact square badges for media overlays', () => {
    render(
      <Badge variant="neutral" shape="square" size="compact" textStyle="code">
        4.9
      </Badge>,
    );

    expect(screen.getByText('4.9')).toHaveClass(
      'rounded-sm',
      'bg-background',
      'text-2xs',
      'font-mono',
    );
  });
});
