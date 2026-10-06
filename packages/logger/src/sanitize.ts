import type { JsonValue, LogFields } from './types';

export const LOG_LIMITS = {
  eventBytes: 8_192,
  stringLength: 2_048,
  stackLength: 4_096,
  depth: 4,
  fields: 40,
  arrayLength: 20,
  visitedValues: 200,
} as const;

const PRIVATE_KEYS = new Set([
  'authorization', 'cookie', 'setcookie', 'password', 'secret', 'token', 'accesstoken',
  'refreshtoken', 'apikey', 'ingestionkey', 'code', 'otp', 'email', 'to', 'phone',
  'phonenumber', 'subscriberid', 'url', 'signedurl', 'headers', 'body', 'payload',
  'request', 'response', 'q', 'query', 'sql', 'config', 'environmentvariables',
]);

export const RESERVED_FIELDS = new Set([
  'schema_version', 'timestamp', 'level', 'severity_text', 'service', 'environment',
  'version', 'event', 'message', 'trace_id', 'span_id', 'trace_flags',
]);

/** Defense in depth; callers must use static messages and allowlisted attributes. */
export function sanitizeText(value: string, maxLength: number = LOG_LIMITS.stringLength): string {
  // A complete RFC UUID is an opaque correlation identifier, not a phone number.
  // Preserve only valid version/variant forms; surrounding prose still gets scrubbed.
  if (/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(value)) {
    return value.slice(0, maxLength);
  }
  return value.slice(0, maxLength)
    .replace(/./gs, (character) => {
      const code = character.charCodeAt(0);
      return code < 32 && code !== 9 && code !== 10 && code !== 13 ? ' ' : character;
    })
    .replace(/\b[a-z][a-z\d+.-]*:\/\/[^\s<>"')]+/gi, '[URL]')
    .replace(/\b[A-Z\d._%+-]+@[A-Z\d.-]+\.[A-Z]{2,}\b/gi, '[EMAIL]')
    .replace(/\b(?:bearer|basic)\s+[^\s,;]+/gi, '[CREDENTIAL]')
    .replace(/\b(?:password|secret|token|api[_-]?key|otp|code)\s*[:=]\s*[^\s,;]+/gi, '[CREDENTIAL]')
    .replace(/\b(?:otp|verification code)\b[^\r\n]*\d{4,8}[^\r\n]*/gi, '[OTP]')
    .replace(/\beyJ[A-Za-z\d_-]+\.[A-Za-z\d_-]+\.[A-Za-z\d_-]+\b/g, '[TOKEN]')
    .replace(/\+?\b\d[\d ().-]{8,}\d\b/g, '[PHONE]');
}

function isPrivateKey(key: string): boolean {
  const normalized = key.replace(/[^a-z\d]/gi, '').toLowerCase();
  return PRIVATE_KEYS.has(normalized) || /password|secret|token|apikey|accesskey|ingestionkey/.test(normalized);
}

type Budget = { remaining: number; seen: WeakSet<object> };

function visit(value: unknown, depth: number, budget: Budget): JsonValue | undefined {
  if (--budget.remaining < 0) return '[Truncated]';
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') return sanitizeText(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return sanitizeText(String(value));
  if (typeof value !== 'object') return undefined;
  if (budget.seen.has(value)) return '[Circular]';
  if (depth >= LOG_LIMITS.depth) return '[Truncated]';
  budget.seen.add(value);
  if (value instanceof Error) return serializeError(value, depth, budget);
  if (Array.isArray(value)) {
    const output: JsonValue[] = [];
    for (let i = 0; i < Math.min(value.length, LOG_LIMITS.arrayLength); i++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      output.push(descriptor && 'value' in descriptor ? visit(descriptor.value, depth + 1, budget) ?? null : null);
    }
    return output;
  }
  const output: Record<string, JsonValue> = {};
  let fieldCount = 0;
  for (const key in value) {
    if (!Object.hasOwn(value, key)) continue;
    if (++fieldCount > LOG_LIMITS.fields) break;
    if (isPrivateKey(key) || key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) continue;
    const normalized = visit(descriptor.value, depth + 1, budget);
    if (normalized !== undefined) output[sanitizeText(key, 96)] = normalized;
  }
  return output;
}

function ownData(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

function errorName(error: Error): string {
  // Built-in error names live on prototypes; read data descriptors only.
  let current: object | null = error;
  for (let i = 0; current && i < 5; i++, current = Object.getPrototypeOf(current)) {
    const descriptor = Object.getOwnPropertyDescriptor(current, 'name');
    if (descriptor) return 'value' in descriptor && typeof descriptor.value === 'string'
      ? sanitizeText(descriptor.value, 80) : 'Error';
  }
  return 'Error';
}

type DatabaseFailure = 'query' | 'database' | 'wrapped';

function databaseFailure(error: Error): DatabaseFailure | undefined {
  const seen = new WeakSet<object>();
  let remaining = 32;
  function inspect(current: Error, depth: number): DatabaseFailure | undefined {
    if (--remaining < 0 || depth > LOG_LIMITS.depth || seen.has(current)) return;
    seen.add(current);
    const message = ownData(current, 'message');
    // Drizzle embeds parameters into message/stack as well as query/params fields.
    if ((typeof ownData(current, 'query') === 'string' && Array.isArray(ownData(current, 'params')))
      || (typeof message === 'string' && /^Failed query:[\s\S]*\nparams:/.test(message))) return 'query';
    const code = ownData(current, 'code');
    if (typeof code === 'string' && /^[A-Z\d]{5}$/.test(code)) return 'database';
    const cause = ownData(current, 'cause');
    if (cause instanceof Error && inspect(cause, depth + 1)) return 'wrapped';
    const errors = ownData(current, 'errors');
    if (Array.isArray(errors)) {
      for (let i = 0; i < Math.min(errors.length, LOG_LIMITS.arrayLength); i++) {
        const item = ownData(errors, String(i));
        if (item instanceof Error && inspect(item, depth + 1)) return 'wrapped';
      }
    }
  }
  return inspect(error, 0);
}

function databaseStack(error: Error, stack: string): string | undefined {
  const message = ownData(error, 'message');
  const prefix = `${errorName(error)}: `;
  // Remove the complete original header before selecting frames. Parameter values
  // can contain newlines and fake "at ..." lines, so filtering the full stack leaks.
  if (typeof message !== 'string' || message.length > 16_384 || !stack.startsWith(prefix)
    || !stack.startsWith(message, prefix.length)) return;
  const frames = stack.slice(prefix.length + message.length, prefix.length + message.length + LOG_LIMITS.stackLength)
    .split('\n').filter((line) => /^\s+at\s+/.test(line)).slice(0, 20).join('\n');
  return frames ? sanitizeText(frames, LOG_LIMITS.stackLength) : undefined;
}

function serializeError(error: Error, depth: number, budget: Budget): Record<string, JsonValue> {
  const database = databaseFailure(error);
  const result: Record<string, JsonValue> = {
    name: database === 'query' ? 'DatabaseQueryError' : database === 'database' ? 'DatabaseError' : errorName(error),
  };
  if (database) {
    result.message = database === 'query' ? 'Database query failed' : 'Database operation failed';
    const code = ownData(error, 'code');
    if (typeof code === 'string' && /^[A-Z\d]{5}$/.test(code)) result.database_code = code;
  }
  // Never copy enumerable provider/database metadata or invoke user getters.
  for (const key of ['message', 'stack', 'cause', 'errors'] as const) {
    const value = ownData(error, key);
    if (key === 'message' && database) continue;
    if (key === 'stack' && typeof value === 'string') {
      const stack = database ? databaseStack(error, value) : sanitizeText(value, LOG_LIMITS.stackLength);
      if (stack) result.stack = stack;
    } else {
      const normalized = visit(value, depth + 1, budget);
      if (normalized !== undefined) result[key] = normalized;
    }
  }
  return result;
}

export function sanitizeLogFields(fields: LogFields): Record<string, JsonValue> {
  try {
    const result = visit(fields, 0, { remaining: LOG_LIMITS.visitedValues, seen: new WeakSet() });
    return result !== null && typeof result === 'object' && !Array.isArray(result) ? result : {};
  } catch {
    return { serialization_failed: true };
  }
}
