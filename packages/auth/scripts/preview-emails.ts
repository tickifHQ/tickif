import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { emailFixtures } from '../src/email-fixtures.js';
import { renderTickifEmail } from '../src/email-templates.js';

// No config or Resend import: previews cannot send mail or load credentials.
const output = resolve('email-previews');
await mkdir(resolve(output, 'images/email'), { recursive: true });
await copyFile(
  new URL('../../../apps/web/public/images/email/tickif-mark.png', import.meta.url),
  resolve(output, 'images/email/tickif-mark.png'),
);
const links: string[] = [];
for (const email of emailFixtures) {
  const name = email.kind === 'otp' ? `otp-${email.purpose}` : email.kind;
  const { html, text } = await renderTickifEmail(email, 'http://localhost:4178');
  await writeFile(resolve(output, `${name}.html`), html);
  await writeFile(resolve(output, `${name}.txt`), text);
  links.push(`<li><a href="${name}.html">${name}</a> · <a href="${name}.txt">Plain text</a></li>`);
}
await writeFile(
  resolve(output, 'index.html'),
  `<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tickif email previews</title><body style="font:16px/2 Arial;background:#eef2f0;color:#18181b;margin:32px"><h1>Tickif email previews</h1><p>Synthetic examples of every transactional variant.</p><ul>${links.join('')}</ul></body></html>`,
);
console.log(`Rendered ${emailFixtures.length} email variants to ${output}`);

if (process.argv.includes('--serve')) {
  const allowed = new Set(['index.html', 'images/email/tickif-mark.png']);
  for (const email of emailFixtures) {
    const name = email.kind === 'otp' ? `otp-${email.purpose}` : email.kind;
    allowed.add(`${name}.html`);
    allowed.add(`${name}.txt`);
  }
  createServer(async (request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost:4178').pathname;
    const name = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (!allowed.has(name)) {
      response.writeHead(404).end('Preview not found');
      return;
    }
    try {
      const data = await readFile(resolve(output, name));
      response.setHeader(
        'Content-Type',
        name.endsWith('.png')
          ? 'image/png'
          : name.endsWith('.txt')
            ? 'text/plain; charset=utf-8'
            : 'text/html; charset=utf-8',
      );
      response.end(data);
    } catch {
      response.writeHead(500).end('Could not read preview');
    }
  }).listen(4178, '127.0.0.1', () => console.log('Open http://localhost:4178 to review emails.'));
}
