/** Trim trailing separators in linear time, retaining any collector path prefix. */
export function signalEndpoint(base: string, signal: 'traces' | 'metrics'): string {
  let end = base.length;
  while (end > 0 && base.charCodeAt(end - 1) === 47) end -= 1;
  return `${base.slice(0, end)}/v1/${signal}`;
}
