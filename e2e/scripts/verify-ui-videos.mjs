import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = resolve(root, process.argv[2] ?? 'test-results/whatsapp-ui-mp4');
mkdirSync(output, { recursive: true });
// Branded Chrome provides H.264 support consistently across CI operating systems.
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let timeout;
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(pathToFileURL(join(output, 'index.html')).href);
  const results = await Promise.race([
    page.evaluate(async () => {
      const results = [];
      for (const video of document.querySelectorAll('video')) {
        const event = (name) =>
          new Promise((resolve, reject) => {
            video.addEventListener(name, resolve, { once: true });
            video.addEventListener(
              'error',
              () => reject(new Error(`Media error ${video.error?.code}`)),
              { once: true },
            );
          });
        if (video.readyState < 1) await event('loadedmetadata');
        video.muted = true;
        await video.play();
        while (video.currentTime < 0.2) await event('timeupdate');
        const seeked = event('seeked');
        video.currentTime = Math.max(0, video.duration - 0.4);
        await seeked;
        video.pause();
        results.push({
          file: video.getAttribute('src'),
          seconds: video.duration,
          width: video.videoWidth,
          height: video.videoHeight,
          currentTime: video.currentTime,
          error: video.error?.code ?? null,
          decodedFrames: video.getVideoPlaybackQuality().totalVideoFrames,
        });
      }
      return results;
    }),
    new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error('Video playback timed out')), 30_000);
    }),
  ]);
  assert.equal(results.length, 5);
  for (const video of results) {
    assert.equal(video.error, null, video.file);
    assert(video.width > 0 && video.height > 0, video.file);
    assert(video.currentTime > 0.2 && video.decodedFrames > 1, video.file);
  }
  writeFileSync(join(output, 'browser-playback.json'), `${JSON.stringify(results, null, 2)}\n`);
  await page.screenshot({ path: join(output, 'browser-playback.png'), fullPage: true });
  console.log('All five MP4s played and sought successfully from the unzipped file-based gallery.');
} finally {
  clearTimeout(timeout);
  await browser.close();
}
