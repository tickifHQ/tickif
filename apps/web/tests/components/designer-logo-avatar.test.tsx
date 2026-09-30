import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DesignerLogoAvatar } from '../../src/components/designer-logo-avatar';

describe('DesignerLogoAvatar', () => {
  it('clips uploaded logos into a circle without stretching them', () => {
    render(
      <DesignerLogoAvatar
        logoUrl="https://cdn.example.test/logo.png"
        alt="Studio logo"
        sizePx={48}
        className="size-12"
        fallback={<span>ST</span>}
        testId="logo"
      />,
    );

    expect(screen.getByTestId('logo')).toHaveClass('rounded-full', 'overflow-hidden', 'size-12');
    expect(screen.getByRole('img', { name: 'Studio logo' })).toHaveClass('object-cover');
    expect(screen.getByRole('img', { name: 'Studio logo' })).toHaveAttribute('width', '48');
    expect(screen.queryByText('ST')).not.toBeInTheDocument();
  });

  it.each([null, undefined, ''])(
    'keeps missing-logo initials inside the circular frame (%s)',
    (logoUrl) => {
      render(
        <DesignerLogoAvatar
          logoUrl={logoUrl}
          alt="Studio logo"
          sizePx={48}
          className="size-12"
          fallback={<span>ST</span>}
          testId="logo"
        />,
      );

      expect(screen.getByTestId('logo')).toHaveClass('rounded-full', 'overflow-hidden');
      expect(screen.getByTestId('logo')).toContainElement(screen.getByText('ST'));
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    },
  );
});
