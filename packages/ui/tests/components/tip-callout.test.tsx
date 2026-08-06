import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TipCallout } from '../../src/components/tip-callout';

describe('TipCallout', () => {
  it('renders the shared Tip treatment with semantic theme tokens', () => {
    const { container } = render(
      <TipCallout>Complete the project details for better visibility.</TipCallout>,
    );

    const callout = container.querySelector('[data-slot="tip-callout"]');

    expect(callout).toHaveClass('flex', 'gap-1');
    expect(callout?.firstElementChild).toHaveClass(
      'w-1',
      'self-stretch',
      'rounded-full',
      'bg-primary',
    );
    expect(callout?.lastElementChild).toHaveClass('border', 'border-border', 'bg-primary/5');
    expect(callout?.querySelector('svg')).toHaveClass('text-primary');
    expect(screen.getByText('Tip')).toHaveClass('text-primary');
    expect(screen.getByText('Complete the project details for better visibility.')).toHaveClass(
      'text-muted-foreground',
    );
  });

  it('accepts layout classes without replacing the shared treatment', () => {
    const { container } = render(<TipCallout className="mt-4">Helpful context</TipCallout>);

    expect(container.firstElementChild).toHaveClass('flex', 'gap-1', 'mt-4');
  });
});
