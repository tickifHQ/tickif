import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from '../../src/components/button';

describe('Button', () => {
  it('renders a button by default', () => {
    render(<Button>Save</Button>);

    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('can render as a child element for link-style actions', () => {
    render(
      <Button asChild>
        <a href="/projects">Projects</a>
      </Button>,
    );

    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/projects');
  });

  it('supports the extra-small neutral design-system button', () => {
    render(
      <Button variant="neutral" size="xs">
        List your work
      </Button>,
    );

    expect(screen.getByRole('button', { name: 'List your work' })).toHaveClass(
      'h-8',
      'bg-button-neutral',
      'text-button-neutral-foreground',
      'shadow-button-neutral',
    );
    expect(screen.getByRole('button', { name: 'List your work' })).not.toHaveClass('border');
  });
});
