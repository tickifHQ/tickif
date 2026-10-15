import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from '../../src/components/button';

describe('Button', () => {
  it('owns hero search geometry with a scale-based size', () => {
    render(<Button size="hero-search">Search</Button>);
    expect(screen.getByRole('button', { name: 'Search' })).toHaveClass('h-13.5', 'px-4', 'sm:px-6');
    expect(screen.getByRole('button', { name: 'Search' })).not.toHaveClass('h-[54px]');
  });
  it('supports the measured navigation action size without changing default controls', () => {
    render(
      <Button variant="ghost" size="navigation">
        Saved
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'Saved' })).toHaveClass(
      'h-10',
      'px-3',
      'gap-1.5',
      'text-[13px]',
      'leading-4',
    );
  });
  it('supports a compact inline customization link with a minimum accessible target', () => {
    render(
      <Button variant="muted-link" size="inline">
        Edit customization
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'Edit customization' })).toHaveClass(
      'text-muted-foreground',
      'underline',
      'min-h-6',
      'px-0',
    );
  });
  it('supports the compact project-save pill with semantic saved state and a larger touch target', () => {
    render(
      <Button variant="project-save" size="project-save" aria-pressed>
        Saved
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'Saved' })).toHaveClass(
      'h-8',
      'min-w-8',
      'gap-1.5',
      '[&_svg:not([class*="size-"])]:size-3.5',
      '[@media(hover:none)]:h-11',
      '[@media(hover:none)]:min-w-11',
      'bg-project-save',
      'text-project-save-foreground',
      'project-save-control',
      'aria-pressed:bg-primary',
      'aria-pressed:text-primary-foreground',
    );
  });
  it('supports compact discovery navigation and inset category thumbnails without changing defaults', () => {
    render(
      <>
        <Button variant="discovery-tab" size="discovery-tab" aria-pressed>
          For you
        </Button>
        <Button variant="discovery-category" size="discovery-category">
          Kitchens
        </Button>
        <Button>Save</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'For you' })).toHaveClass(
      'h-9.5',
      'px-3.5',
      'aria-pressed:bg-foreground',
    );
    expect(screen.getByRole('button', { name: 'Kitchens' })).toHaveClass(
      'h-9.5',
      'pl-1',
      'pr-3.5',
      'bg-card',
      'border-foreground/10',
    );
    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('h-11', 'bg-primary');
  });
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
      'rounded-full',
      'border-button-fancy-border',
      'bg-button-fancy',
      'text-button-fancy-foreground',
      'shadow-button-fancy',
    );
  });
});
