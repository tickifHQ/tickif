import { AsyncLocalStorage } from 'node:async_hooks';
import { sanitizeLogFields } from './sanitize';
import type { LogContext } from './types';

const logContext = new AsyncLocalStorage<LogContext>();

export function runWithLogContext<T>(context: LogContext, fn: () => T): T {
  return logContext.run({ ...getLogContext(), ...sanitizeLogFields(context) }, fn);
}

export function getLogContext(): LogContext {
  return { ...logContext.getStore() };
}
