#!/usr/bin/env bash
set -euo pipefail

# Run against an already-built image. No provider access, secrets or saved media.
image=${1:?Usage: bash infra/staging/scripts/test-worker-fonts.sh WORKER_IMAGE}
docker image inspect "$image" >/dev/null
output=$(docker run --rm --read-only --network none --cap-drop ALL \
  --security-opt no-new-privileges --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --workdir /app/apps/worker --entrypoint node "$image" --input-type=module -e '
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
assert.equal(process.getuid(), 1001, "Smoke must run as the application user");
assert.ok(existsSync("/etc/fonts/fonts.conf"), "Runtime font configuration is missing");
const font = execFileSync("fc-match", ["Arial,Helvetica,sans-serif", "--format=%{file}"], { encoding: "utf8" });
assert.ok(font.startsWith("/usr/share/fonts/") && existsSync(font), "Watermark font must resolve to an installed font");
const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="100"><text x="20" y="60" font-family="Arial, Helvetica, sans-serif" font-weight="600" font-size="40" fill="white">tickif</text></svg>`);
for (const format of ["webp", "avif"]) {
  const output = await sharp({ create: { width: 320, height: 100, channels: 3, background: "blue" } })
    .composite([{ input: svg }]).toFormat(format).toBuffer();
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.width, 320);
  assert.equal(metadata.height, 100);
  const stats = await sharp(output).stats();
  assert.ok(stats.channels.some(channel => channel.stdev > 10), "Rendered text must be visible");
}
console.log("Non-root read-only worker rendered visible WebP and AVIF text with installed fonts.");
' 2>&1) || { printf '%s\n' "$output" >&2; exit 1; }
printf '%s\n' "$output"
[[ "$output" != *Fontconfig* ]] || { echo 'Unexpected Fontconfig warning' >&2; exit 1; }
