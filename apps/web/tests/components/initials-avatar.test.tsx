import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InitialsAvatar } from '../../src/components/initials-avatar';

describe('InitialsAvatar', () => {
  it('renders initials from a persisted display name', () => {
    render(
      <InitialsAvatar seed="Sarthak Wade" fallbackSeed="Your name" alt="Named account avatar" />,
    );

    const source = screen.getByRole('img', { name: 'Named account avatar' }).getAttribute('src');
    expect(decodeURIComponent(source ?? '')).toContain('>SW<');
  });

  it('uses the fallback seed when a phone identity has no letters to render', () => {
    render(
      <>
        <InitialsAvatar seed="+918668394719" fallbackSeed="Your name" alt="Phone account avatar" />
        <InitialsAvatar seed="" fallbackSeed="Your name" alt="Fallback avatar" />
      </>,
    );

    expect(screen.getByRole('img', { name: 'Phone account avatar' })).toHaveAttribute(
      'src',
      screen.getByRole('img', { name: 'Fallback avatar' }).getAttribute('src'),
    );
  });
});
