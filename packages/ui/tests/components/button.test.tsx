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

  it('supports the compact inverted design-system button', () => {
    render(
      <Button variant="inverted" size="compact">
        Add new project
      </Button>,
    );

    expect(screen.getByRole('button', { name: 'Add new project' })).toHaveClass(
      'h-8',
      'gap-1.5',
      'px-2.5',
      'bg-button-inverted',
      'text-button-inverted-foreground',
      'shadow-button-inverted',
    );
  });

  it('supports the fancy design-system button', () => {
    render(
      <Button variant="fancy" size="fancy">
        Login
      </Button>,
    );

    expect(screen.getByRole('button', { name: 'Login' })).toHaveClass(
      'h-10',
      'rounded-lg',
      'border-button-fancy-border',
      'bg-button-fancy',
      'text-button-fancy-foreground',
      'shadow-button-fancy',
    );
  });
});
