import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { isProduction } from '@repo/config';

/**
 * Domain-level error thrown by the service layer. Services stay framework-free
 * by throwing these; the route/error-handler boundary maps them to HTTP.
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: ContentfulStatusCode = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static notFound(message = 'Resource not found', details?: unknown) {
    return new AppError('not_found', message, 404, details);
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError('bad_request', message, 400, details);
  }

  static unauthorized(message = 'Authentication required') {
    return new AppError('unauthorized', message, 401);
  }

  static forbidden(message = 'Insufficient permissions') {
    return new AppError('forbidden', message, 403);
  }

  static conflict(message: string, details?: unknown) {
    return new AppError('conflict', message, 409, details);
  }

  static unprocessable(message: string, details?: unknown) {
    return new AppError('validation_error', message, 422, details);
  }
}

/** Central error handler — single place that converts errors to the API envelope. */
export function onError(err: Error, c: Context) {
  if (err instanceof AppError) {
    // Don't leak internal error details (raw values, schema shape) to prod clients.
    const details = isProduction ? undefined : err.details;
    return c.json({ error: { code: err.code, message: err.message, details } }, err.status);
  }
  if (err instanceof HTTPException) {
    return c.json({ error: { code: 'http_error', message: err.message } }, err.status);
  }
  console.error('[api] unhandled error:', err);
  return c.json({ error: { code: 'internal_error', message: 'Internal server error' } }, 500);
}
