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
});
