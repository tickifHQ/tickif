import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Input } from '../../src/components/input';

describe('Input', () => {
  it('renders a textbox', () => {
    render(<Input placeholder="Project name" />);

    expect(screen.getByPlaceholderText('Project name')).toBeInTheDocument();
  });

  it('can be disabled', () => {
    render(<Input placeholder="Project name" disabled />);

    expect(screen.getByPlaceholderText('Project name')).toBeDisabled();
  });

  it('keeps a grey input boundary on hover without removing focus or error states', () => {
    render(<Input aria-invalid placeholder="Phone" />);
    expect(screen.getByPlaceholderText('Phone')).toHaveClass(
      'border-input',
      'hover:border-input',
      'focus-visible:ring-2',
      'aria-invalid:border-destructive',
    );
    expect(screen.getByPlaceholderText('Phone')).not.toHaveClass(
      'hover:border-foreground-secondary',
    );
  });
});
