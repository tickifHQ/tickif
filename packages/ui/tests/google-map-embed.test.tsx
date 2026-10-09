import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GoogleMapEmbed, googleMapEmbedUrl } from '../src/components/google-map-embed';

const embed = 'https://www.google.com/maps/embed?pb=!1m18!2sBengaluru';

describe('GoogleMapEmbed', () => {
  it.each(['https://maps.app.goo.gl/example', null, 'javascript:alert(1)'])(
    'uses the supplied address when %s is not embeddable',
    (src) => {
      const container = document.createElement('div');
      container.innerHTML = renderToStaticMarkup(
        <GoogleMapEmbed
          src={src}
          query="R2, Kakkalur Bypass Rd, Tiruvallur, Tamil Nadu, 602001"
          title="Studio map"
        />,
      );
      const url = new URL(container.querySelector('iframe')!.getAttribute('src')!);
      expect(url.origin).toBe('https://www.google.com');
      expect(url.pathname).toBe('/maps');
      expect(url.searchParams.get('output')).toBe('embed');
      expect(url.searchParams.get('q')).toBe(
        'R2, Kakkalur Bypass Rd, Tiruvallur, Tamil Nadu, 602001',
      );
    },
  );

  it('loads an official shared map lazily with an accessible title', () => {
    const container = document.createElement('div');
    // Inspect server markup without mounting a network-loading iframe.
    container.innerHTML = renderToStaticMarkup(
      <GoogleMapEmbed src={embed} query="Fallback address" title="HSR Layout studio map" />,
    );
    const frame = container.querySelector('iframe');
    expect(frame).toHaveAttribute('title', 'HSR Layout studio map');
    expect(frame).toHaveAttribute('src', embed);
    expect(frame).toHaveAttribute('loading', 'lazy');
    expect(frame).toHaveAttribute('allowfullscreen');
    expect(frame).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  });

  it.each([
    null,
    '',
    'javascript:alert(1)',
    'http://www.google.com/maps/embed?pb=!1m18',
    'https://google.com.evil.example/maps/embed?pb=!1m18',
    'https://www.google.com:8443/maps/embed?pb=!1m18',
    'https://user:password@www.google.com/maps/embed?pb=!1m18',
    'https://www.google.com/maps/search/?q=Bengaluru',
    'https://www.google.com/maps/embed?pb=',
  ])('keeps unsupported URL %s out of the iframe', (src) => {
    expect(googleMapEmbedUrl(src)).toBeNull();
    expect(renderToStaticMarkup(<GoogleMapEmbed src={src} title="Studio map" />)).toBe('');
  });
});
