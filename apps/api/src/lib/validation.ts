import type { Context } from 'hono';

type ZodIssueLike = { path: PropertyKey[]; message: string };

/** Minimal field→message view; raw Zod issues leak the schema shape to clients. */
export function flattenIssues(issues: ReadonlyArray<ZodIssueLike>): Array<{ path: string; message: string }> {
  return issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message }));
}

/**
 * Shared OpenAPIHono defaultHook. Mounted sub-apps don't inherit the base hook,
 * so every OpenAPIHono instance must pass this to keep one 422 envelope.
 */
export function validationHook(
  result: { success: true } | { success: false; error: { issues: ReadonlyArray<ZodIssueLike> } },
  c: Context,
) {
  if (!result.success) {
    return c.json(
      {
        error: {
          code: 'validation_error',
          message: 'Request validation failed',
          details: flattenIssues(result.error.issues),
        },
      },
      422,
    );
  }
}
