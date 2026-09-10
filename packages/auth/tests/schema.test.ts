import { describe, expect, it } from 'vitest';
import { auth } from '../src/index.js';

describe('configured Better Auth schema', () => {
  it('serves anonymous session requests after validating every configured plugin table', async () => {
    // The Drizzle adapter validates the declared tables before serving auth routes.
    // This requires no database query: an anonymous request has no session to load.
    const response = await auth.handler(new Request('http://localhost:3000/api/auth/get-session'));

    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });
});
