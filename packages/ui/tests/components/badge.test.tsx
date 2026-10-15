import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from '../../src/components/badge';

describe('Badge', () => {
  it('supports the measured navigation counter typography', () => {
    render(
      <Badge variant="contrast" size="navigation">
        23
      </Badge>,
    );
    expect(screen.getByText('23')).toHaveClass(
      'border-0',
      'px-1.5',
      'py-0.5',
      'font-mono',
      'text-[10px]',
      'leading-3',
      'tracking-[0.06em]',
    );
  });
  it('reuses the compact media typography for a themed project budget capsule', () => {
    render(
      <Badge variant="project-budget" size="media">
        ₹40–50L
      </Badge>,
    );
    expect(screen.getByText('₹40–50L')).toHaveClass(
      'bg-project-budget',
      'text-project-budget-foreground',
      'border-0',
      'px-2',
      'py-1',
      'font-mono',
      'text-[10px]',
      'leading-3',
      'tracking-[0.06em]',
    );
  });
  it('supports warm preference labels and unfilled update annotations without changing existing badges', () => {
    render(
      <>
        <Badge variant="preference" size="label" shape="square">
          3 BHK
        </Badge>
        <Badge variant="text" size="text" textStyle="code">
          3 NEW
        </Badge>
      </>,
    );
    expect(screen.getByText('3 BHK')).toHaveClass(
      'bg-visitor-preference',
      'text-muted-foreground',
      'text-[13px]',
    );
    expect(screen.getByText('3 NEW')).toHaveClass('bg-transparent', 'p-0', 'text-primary');
  });
  it('supports opt-in neutral contrast and terracotta counters without changing inverse badges', () => {
    render(
      <>
        <Badge variant="contrast">Saved count</Badge>
        <Badge variant="terracotta">Enquiry count</Badge>
        <Badge variant="inverse">Existing inverse</Badge>
      </>,
    );
    expect(screen.getByText('Saved count')).toHaveClass('bg-foreground', 'text-background');
    expect(screen.getByText('Enquiry count')).toHaveClass(
      'bg-badge-terracotta',
      'text-badge-terracotta-foreground',
    );
    expect(screen.getByText('Existing inverse')).toHaveClass(
      'bg-surface-inverse',
      'text-surface-inverse-foreground',
    );
  });
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
      'text-2xs/none',
      'font-mono',
    );
  });
});
