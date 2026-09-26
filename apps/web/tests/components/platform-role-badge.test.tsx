import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PlatformRoleBadge } from '@/components/platform-role-badge';

describe('PlatformRoleBadge', () => {
  it.each([
    ['visitor', 'Visitor', 'bg-muted', 'text-muted-foreground'],
    ['designer', 'Designer', 'bg-success-lighter', 'text-success'],
    ['admin', 'Admin', 'bg-info/10', 'text-info'],
    ['superadmin', 'Super admin', 'bg-feature/10', 'text-feature'],
  ] as const)('presents the %s role with its semantic color', (role, label, background, text) => {
    render(<PlatformRoleBadge role={role} />);

    expect(screen.getByText(label)).toHaveClass(background, text, 'border-transparent');
  });
});
