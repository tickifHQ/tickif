import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const input = resolve(root, process.argv[2] ?? 'test-results/whatsapp-ui');
const output = resolve(root, process.argv[3] ?? 'test-results/whatsapp-ui-mp4');
const ffmpeg = process.argv[4] ?? 'ffmpeg';
const ffprobe = process.argv[5] ?? 'ffprobe';
const recordings = [
  ['authentication-phone-OTP-', '01-whatsapp-login', 'WhatsApp login'],
  ['authentication-email-OTP-', '02-email-login', 'Email login'],
  ['whatsapp-verification-indi-', '03-individual-onboarding', 'Individual onboarding'],
  ['whatsapp-verification-pers-', '04-personal-settings', 'Personal settings'],
  ['whatsapp-verification-comp-', '05-company-profile', 'Company onboarding and profile'],
];
function run(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', windowsHide: true });
}
mkdirSync(output, { recursive: true });
const directories = readdirSync(input, { withFileTypes: true }).filter((entry) =>
  entry.isDirectory(),
);
const manifest = [];
for (const [prefix, name, title] of recordings) {
  const matches = directories.filter((entry) => entry.name.startsWith(prefix));
  assert.equal(matches.length, 1, `Expected exactly one recording for ${title}`);
  const source = join(input, matches[0].name, 'video.webm');
  const target = join(output, `${name}.mp4`);
  run(ffmpeg, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    source,
    '-map',
    '0:v:0',
    '-an',
    '-c:v',
    'libx264',
    '-profile:v',
    'baseline',
    '-level:v',
    '4.0',
    '-pix_fmt',
    'yuv420p',
    '-crf',
    '18',
    '-preset',
    'medium',
    '-movflags',
    '+faststart',
    target,
  ]);
  const metadata = JSON.parse(
    run(ffprobe, [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=codec_name,pix_fmt,width,height:format=duration',
      '-of',
      'json',
      target,
    ]),
  );
  assert.equal(metadata.streams[0].codec_name, 'h264');
  assert.equal(metadata.streams[0].pix_fmt, 'yuv420p');
  assert(Number(metadata.format.duration) > 0, `${title} must have a positive duration`);
  // Fully decode every exported file so a nonempty but broken recording fails CI.
  run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-xerror', '-i', target, '-f', 'null', '-']);
  run(ffmpeg, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-ss',
    '1',
    '-i',
    target,
    '-frames:v',
    '1',
    join(output, `${name}.jpg`),
  ]);
  manifest.push({
    title,
    file: `${name}.mp4`,
    poster: `${name}.jpg`,
    seconds: Number(metadata.format.duration),
    codec: metadata.streams[0].codec_name,
    pixelFormat: metadata.streams[0].pix_fmt,
    source: `${matches[0].name}/video.webm`,
    sourceSha256: createHash('sha256').update(readFileSync(source)).digest('hex'),
    sha256: createHash('sha256').update(readFileSync(target)).digest('hex'),
  });
}
writeFileSync(join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(
  join(output, 'README.txt'),
  'Unzip the complete artifact, then open index.html in Chrome, Edge or Safari.\n' +
    'Or open any numbered .mp4 directly in a video player.\n' +
    'These are H.264 baseline / yuv420p MP4 files, validated by fully decoding every frame.\n' +
    'The real browser/app recordings use synthetic MSG91/Resend delivery.\n' +
    'Original WebM recordings and the Playwright report are in the separate whatsapp-ui-verification artifact.\n',
);
writeFileSync(
  join(output, 'index.html'),
  `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tickif UI verification videos</title>
<style>body{font:16px system-ui;margin:32px auto;padding:0 20px;max-width:1100px;color:#172b25;background:#f7faf8}section{margin:32px 0}video{width:100%;background:#111;border-radius:8px}a{color:#006b51}small{display:block;margin-top:8px}</style>
<h1>Tickif UI verification</h1>
<p>Click Play on a video, or use its download link. Real application and browser; provider delivery uses fixtures.</p>
${manifest.map((item) => `<section><h2>${item.title}</h2><video controls playsinline preload="metadata" poster="${item.poster}" src="${item.file}"></video><small><a href="${item.file}" download>Download MP4</a> · ${item.seconds.toFixed(1)} seconds · H.264</small></section>`).join('\n')}
</html>`,
);
console.log(
  `Exported and fully decoded ${manifest.length} H.264 MP4 videos in ${dirname(join(output, 'index.html'))}`,
);
