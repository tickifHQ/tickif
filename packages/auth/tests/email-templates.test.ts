import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { emailFixtures } from '../src/email-fixtures.js';
import { renderTickifEmail } from '../src/email-templates.js';

const baseUrl = 'https://tickif.example';

describe('Tickif transactional emails', () => {
  it.each(emailFixtures)('renders HTML and text for $kind ($purpose)', async (email) => {
    const { html, text } = await renderTickifEmail(email, baseUrl);
    expect(html).toContain('<!DOCTYPE html');
    expect(html).toContain('lang="en"');
    expect(html).toContain('https://tickif.example/images/email/tickif-mark.png');
    expect(html).toContain('#1a9b7a');
    expect(html).toContain('<h1');
    expect(html).not.toMatch(/<script|<svg|undefined|javascript:|localhost/);
    expect(Buffer.byteLength(html)).toBeLessThan(102400);
    expect(text).toContain('Tickif');
    expect(text).not.toMatch(/<\/?(?:html|table|div|p)[\s>]/);
    if ('code' in email) {
      expect(html).toContain(email.code);
      expect(text).toContain(email.code);
      expect(text).toContain('5 minutes');
    }
    if ('url' in email) {
      expect(text).toContain(email.url);
      expect(html).toContain('Button not working?');
    }
    if ('note' in email)
      expect(text.replace(/\s+/g, ' ')).toContain(email.note.replace(/\s+/g, ' '));
    if (email.kind === 'invitation') expect(text).toContain('7 days');
  });

  it('escapes names, studio names, email addresses and reviewer notes', async () => {
    const hostile = '<script>alert("x")</script>';
    for (const email of [
      { kind: 'verify-email' as const, name: hostile, url: baseUrl },
      { kind: 'invitation' as const, organization: hostile, inviter: hostile, url: baseUrl },
      { kind: 'invitation-declined' as const, organization: hostile, email: hostile },
      { kind: 'ownership-previous' as const, newOwner: hostile },
      { kind: 'verification-changes' as const, note: hostile },
    ]) {
      const { html, text } = await renderTickifEmail(email, baseUrl);
      expect(html).not.toContain(hostile);
      expect(html).toContain('&lt;script&gt;');
      expect(text).toContain(hostile);
    }
  });

  it('handles missing names and notes without empty reviewer panels', async () => {
    const { text } = await renderTickifEmail(
      { kind: 'verify-email', name: '', url: baseUrl },
      baseUrl,
    );
    expect(text).not.toContain('Hi ,');
    for (const note of [undefined, null, '']) {
      const rendered = await renderTickifEmail({ kind: 'verification-changes', note }, baseUrl);
      expect(rendered.text).not.toContain('Reviewer note');
    }
  });

  it('rejects unsafe action and brand URL protocols', async () => {
    await expect(
      renderTickifEmail({ kind: 'verify-email', name: '', url: 'javascript:alert(1)' }, baseUrl),
    ).rejects.toThrow('HTTP');
    await expect(
      renderTickifEmail({ kind: 'ownership-new' }, 'data:text/html,bad'),
    ).rejects.toThrow('HTTP');
  });

  it('ships a raster version of the product mark for email clients', async () => {
    const png = await readFile(
      new URL('../../../apps/web/public/images/email/tickif-mark.png', import.meta.url),
    );
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(96);
    expect(png.readUInt32BE(20)).toBe(96);
  });
});
