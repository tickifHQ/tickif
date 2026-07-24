import { render, screen } from '@testing-library/react';
import { Sparkle } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { TrustStrip } from '../../src/components/trust-strip';

describe('TrustStrip', () => {
  it('renders its default content and accepts page-specific items', () => {
    const { rerender } = render(<TrustStrip />);

    expect(screen.getByText('12,400+ real homes, fully verified')).toBeInTheDocument();
    expect(screen.getByText('Talk directly to the designers')).toBeInTheDocument();
    expect(screen.getByText('No commissions · No middlemen')).toBeInTheDocument();

    rerender(<TrustStrip items={[{ icon: Sparkle, label: 'Profile-specific trust' }]} />);

    expect(screen.getByText('Profile-specific trust')).toBeInTheDocument();
    expect(screen.queryByText('12,400+ real homes, fully verified')).not.toBeInTheDocument();
  });
});
