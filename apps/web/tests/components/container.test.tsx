import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Container } from '../../src/components/container';

describe('Container', () => {
  it('renders children inside a centered, padded wrapper', () => {
    render(<Container>hello</Container>);
    const el = screen.getByText('hello');
    expect(el).toBeInTheDocument();
    expect(el.className).toContain('mx-auto');
    expect(el.className).toContain('max-w-5xl');
  });

  it('renders a custom element via the `as` prop', () => {
    render(
      <Container as="main">
        <p>content</p>
      </Container>,
    );
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('merges an extra className', () => {
    render(<Container className="py-16">spaced</Container>);
    expect(screen.getByText('spaced').className).toContain('py-16');
  });
});
