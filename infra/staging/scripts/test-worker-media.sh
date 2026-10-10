#!/usr/bin/env bash
set -euo pipefail

image=${1:?Usage: bash infra/staging/scripts/test-worker-media.sh WORKER_IMAGE}
docker image inspect "$image" >/dev/null
docker run --rm --read-only --network none --cap-drop ALL \
  --security-opt no-new-privileges --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --workdir /app/apps/worker --entrypoint node "$image" --input-type=module -e '
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import sharp from "sharp";
assert.equal(process.getuid(), 1001, "Smoke must run as the application user");
for (const name of ["header-symbol", "header-wordmark", "center-symbol", "corner-symbol"]) {
  const asset = readFileSync(`dist/assets/${name}.svg`);
  assert.ok(asset.length > 0, `${name} must be packaged`);
  const rendered = await sharp(asset).resize({ width: 100 }).png().toBuffer();
  for (const format of ["webp", "avif"]) {
    const output = await sharp({ create: { width: 120, height: 140, channels: 3, background: "blue" } })
      .composite([{ input: rendered }]).toFormat(format).toBuffer();
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.width, 120);
    assert.equal(metadata.height, 140);
    const stats = await sharp(output).stats();
    assert.ok(stats.channels.some(channel => channel.stdev > 5), `${name} must be visible in ${format}`);
  }
}
console.log("Non-root read-only worker rendered all four bundled logo assets in WebP and AVIF.");
'
