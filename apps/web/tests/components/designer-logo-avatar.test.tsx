import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DesignerLogoAvatar } from '../../src/components/designer-logo-avatar';

describe('DesignerLogoAvatar', () => {
  it.each([null, '/broken.png'])('keeps decorative fallback initials out of link names (%s)', (logoUrl) => {
    render(
      <a href="/d/studio-one">
        <DesignerLogoAvatar logoUrl={logoUrl} alt="" sizePx={40} fallback="ST" />
        Studio One
      </a>,
    );
    if (logoUrl) fireEvent.error(screen.getByAltText(''));
    expect(screen.getByRole('link')).toHaveAccessibleName('Studio One');
    expect(screen.getByText('ST')).toBeVisible();
  });

  it('preserves logo proportions inside the same stable circular frame', () => {
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
    expect(screen.getByRole('img', { name: 'Studio logo' })).toHaveClass('object-contain');
    expect(screen.getByRole('img', { name: 'Studio logo' })).toHaveAttribute('width', '48');
    expect(screen.queryByText('ST')).not.toBeInTheDocument();
  });

  it('shows initials after an image fails and retries when the saved URL changes', () => {
    const props = { alt: 'Studio logo', sizePx: 48, fallback: <span>ST</span> };
    const { rerender } = render(
      <DesignerLogoAvatar {...props} logoUrl="https://cdn.example.test/broken.png" />,
    );
    fireEvent.error(screen.getByRole('img', { name: 'Studio logo' }));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('ST')).toBeVisible();
    rerender(<DesignerLogoAvatar {...props} logoUrl="https://cdn.example.test/replacement.png" />);
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://cdn.example.test/replacement.png',
    );
    expect(screen.queryByText('ST')).not.toBeInTheDocument();
  });

  it.each([
    [400, 100],
    [100, 400],
  ])('keeps all edges of a legacy %s by %s logo inside the circle', async (width, height) => {
    render(
      <DesignerLogoAvatar logoUrl="/legacy.png" alt="Studio logo" sizePx={48} fallback="ST" />,
    );
    const image = screen.getByRole('img');
    Object.defineProperties(image, {
      naturalWidth: { value: width },
      naturalHeight: { value: height },
    });
    await act(async () => {
      fireEvent.load(image);
    });
    expect(image.style.transform).toBe(
      'scale(' + Math.max(width, height) / Math.hypot(width, height) + ')',
    );
  });

  it('preserves a saved square crop without adding padding or replacing its source', async () => {
    render(
      <DesignerLogoAvatar
        logoUrl="https://cdn.example.test/saved-crop.webp"
        alt="Studio logo"
        sizePx={48}
        fallback="ST"
      />,
    );
    const image = screen.getByRole('img');
    Object.defineProperties(image, { naturalWidth: { value: 512 }, naturalHeight: { value: 512 } });
    await act(async () => {
      fireEvent.load(image);
    });
    expect(image.style.transform).toBe('');
    expect(image).toHaveAttribute('src', 'https://cdn.example.test/saved-crop.webp');
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
