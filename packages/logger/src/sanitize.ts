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

function serializeError(error: Error, depth: number, budget: Budget): Record<string, JsonValue> {
  const result: Record<string, JsonValue> = {};
  // Do not copy enumerable provider/database metadata or invoke user getters.
  for (const key of ['name', 'message', 'stack', 'cause', 'errors'] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(error, key);
    if (!descriptor || !('value' in descriptor)) continue;
    const value: unknown = descriptor.value;
    if (key === 'stack' && typeof value === 'string') {
      result.stack = sanitizeText(value, LOG_LIMITS.stackLength);
    } else {
      const normalized = visit(value, depth + 1, budget);
      if (normalized !== undefined) result[key] = normalized;
    }
  }
  if (!result.name) result.name = error instanceof AggregateError ? 'AggregateError' : 'Error';
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
