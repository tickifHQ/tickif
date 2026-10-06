import { z } from 'zod';

export const frameworkRuntimeSchema = z.enum(['nodejs', 'edge']).optional();

/** Literal framework marker allows Next to prune Node imports; no fs/dotenv imports. */
export const isNodeRuntime = process.env.NEXT_RUNTIME === 'nodejs';

export function getFrameworkRuntime(): 'nodejs' | 'edge' | undefined {
  const result = frameworkRuntimeSchema.safeParse(process.env.NEXT_RUNTIME);
  if (!result.success) throw new Error('Invalid telemetry configuration: NEXT_RUNTIME');
  return result.data;
}
