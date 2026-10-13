/** Compare validated UTC activity timestamps without discarding database microseconds. */
export function latestEnquiryReadWatermark(values: readonly (string | null | undefined)[]) {
  let latest: string | undefined;
  for (const value of values) {
    if (!value || !Number.isFinite(Date.parse(value))) continue;
    const normalized = value.replace(
      /(?:\.(\d+))?Z$/,
      (_match, fraction: string | undefined) => `.${(fraction ?? '').padEnd(6, '0')}Z`,
    );
    if (!latest || normalized > latest) latest = normalized;
  }
  return latest;
}
