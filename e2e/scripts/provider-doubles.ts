import { createServer } from 'node:http';
import { z } from 'zod';
import { environment, providerUrl } from '../lib/environment.js';

if (
  environment.NODE_ENV !== 'test' ||
  environment.RESEND_API_KEY !== 're_tickif_e2e_provider_double'
)
  throw new Error('Provider doubles can run only inside the guarded E2E launcher');

const googleProfile = z.object({
  sub: z.string().min(1),
  email: z.email().endsWith('@test.local'),
  name: z.string().min(1),
});
const emailMessage = z.object({
  to: z.union([z.string(), z.array(z.string())]),
  html: z.string(),
  subject: z.string(),
});
const messages: Array<z.infer<typeof emailMessage>> = [];
const originalFetch = globalThis.fetch;

export function installProviderDoubles(serveMailbox: boolean) {
  /** Only provider network boundaries are replaced; Tickif routes/session creation remain real. */
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.origin === 'https://api.resend.com' && url.pathname === '/emails') {
      const message = emailMessage.parse(await request.json());
      const recipients = Array.isArray(message.to) ? message.to : [message.to];
      if (
        recipients.some(
          (recipient) =>
            !recipient.endsWith('@test.local') &&
            !recipient.endsWith('@phone.tickif.local') &&
            !recipient.endsWith('.test'),
        )
      )
        throw new Error('Email double refuses non-synthetic recipients');
      if (serveMailbox) messages.push(message);
      else
        await originalFetch(`${providerUrl}/emails`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message),
        });
      return Response.json({ id: `e2e-message-${messages.length}` });
    }
    if (url.origin === 'https://oauth2.googleapis.com' && url.pathname === '/token') {
      const body = new URLSearchParams(await request.text());
      const code = body.get('code') ?? '';
      if (!code.startsWith('tickif-e2e:'))
        return Response.json({ error: 'invalid_grant' }, { status: 400 });
      const profile = googleProfile.parse(
        JSON.parse(Buffer.from(code.slice('tickif-e2e:'.length), 'base64url').toString()),
      );
      const now = Math.floor(Date.now() / 1000);
      const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
      const idToken = `${encode({ alg: 'RS256', kid: 'test', typ: 'JWT' })}.${encode({ ...profile, iss: 'https://accounts.google.com', aud: environment.GOOGLE_CLIENT_ID, email_verified: true, iat: now, exp: now + 3600 })}.test-signature`;
      return Response.json({
        access_token: 'e2e-google-access',
        id_token: idToken,
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'openid email profile',
      });
    }
    if (!['localhost', '127.0.0.1'].includes(url.hostname))
      throw new Error(`E2E blocked an unconfigured external provider: ${url.hostname}`);
    return originalFetch(request);
  };

  if (!serveMailbox) return;
  const mailbox = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health')
      return void response.writeHead(200).end('provider doubles ready');
    if (request.method === 'GET' && url.pathname === '/emails') {
      const recipient = url.searchParams.get('to');
      const matching = messages.filter((message) =>
        (Array.isArray(message.to) ? message.to : [message.to]).includes(recipient ?? ''),
      );
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(matching));
      return;
    }
    if (request.method === 'POST' && url.pathname === '/emails') {
      let body = '';
      request.on('data', (chunk: Buffer) => {
        body += chunk.toString();
        if (body.length > 100_000) request.destroy();
      });
      request.on('end', () => {
        try {
          messages.push(emailMessage.parse(JSON.parse(body)));
          response.writeHead(200).end('received');
        } catch {
          response.writeHead(400).end();
        }
      });
      return;
    }
    response.writeHead(404).end();
  });
  mailbox.listen(Number(environment.E2E_PROVIDER_PORT), '127.0.0.1');
}

// The test-only wrapper has no endpoint mounted in the application or production image.
