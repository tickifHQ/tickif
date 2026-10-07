import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('.', import.meta.url));
const repository = fileURLToPath(new URL('../../../', import.meta.url));
const read = (filename) => JSON.parse(fs.readFileSync(path.join(directory, filename), 'utf8'));
const manifest = read('asset-manifest.json');

for (const asset of manifest.staticAssets) {
  const filename = path.join(directory, asset.path);
  const contents = fs.readFileSync(filename);
  assert(contents.length > 0, `${asset.path} is empty`);
  assert.equal(contents.length, asset.bytes, `${asset.path} size differs from the manifest`);
  assert.equal(
    createHash('sha256').update(contents).digest('hex'),
    asset.sha256,
    `${asset.path} content differs from the Figma export`,
  );
  if (asset.format === 'svg') {
    const root = contents.toString('utf8').match(/<svg\b[^>]*>/)?.[0];
    assert(root, `${asset.path} has no SVG root`);
    assert.equal(Number(root.match(/\bwidth="([\d.]+)"/)?.[1]), asset.rootWidth);
    assert.equal(Number(root.match(/\bheight="([\d.]+)"/)?.[1]), asset.rootHeight);
    assert.equal(root.match(/\bviewBox="([^"]+)"/)?.[1], asset.viewBox);
  } else {
    assert.equal(contents.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(contents.readUInt32BE(16), asset.rootWidth);
    assert.equal(contents.readUInt32BE(20), asset.rootHeight);
  }
  assert(asset.rootWidth > 0 && asset.rootHeight > 0);
  assert(asset.slots.length > 0 && asset.slots.every(Boolean));
}

const spec = read('token-spec.json');
assert.equal(new Set(spec.tokens.map((token) => token.name)).size, spec.tokens.length);
assert(spec.tokens.filter((token) => token.basis === 'figma').every((token) => token.sourceNodeId));

const audit = read('component-audit.json');
for (const entry of audit.components) {
  for (const filename of [entry.source, ...entry.sourceCallers, ...entry.testCallers]) {
    assert(fs.existsSync(path.join(repository, filename)), `Missing caller ${filename}`);
  }
}
for (const route of audit.routes) {
  assert(fs.existsSync(path.join(repository, route)), `Missing route ${route}`);
}

const luminance = (hex) => {
  const values = [1, 3, 5]
    .map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
};
const contrast = read('contrast-check.json').contrast;
for (const pair of contrast) {
  const a = luminance(pair.foreground);
  const b = luminance(pair.background);
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  assert(ratio >= 4.5, `${pair.role} fails normal text contrast`);
  assert.equal(Number(ratio.toFixed(2)), pair.ratio);
}

console.log(
  JSON.stringify({
    staticAssets: manifest.staticAssets.length,
    dynamicPhotoSlots: manifest.dynamicImagery.length,
    tokens: spec.tokens.length,
    components: audit.components.length,
    routeStateFiles: audit.routes.length,
    contrastPairs: contrast.length,
    status: 'passed; specification integrity only, not rendered UI verification',
  }),
);
