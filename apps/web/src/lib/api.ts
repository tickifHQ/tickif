import { hc } from 'hono/client';
import type { AppType } from '@repo/api';

/**
 * Type-safe API client. `AppType` is imported type-only from the Hono app, so
 * the web bundle never pulls in server code — but every call is checked against
 * the real route definitions at compile time (no codegen step).
 */
const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8008';

export const api = hc<AppType>(baseUrl);
