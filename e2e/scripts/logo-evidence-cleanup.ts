import { existsSync, readFileSync, rmdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export default function cleanupLogoEvidence() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const route = path.join(root, 'apps/web/app/logo-display-evidence');
  const page = path.join(route, 'page.tsx');
  if (!existsSync(page)) return;
  const fixture = path.join(root, 'e2e/visual/logo-evidence-page.tsx.fixture');
  if (readFileSync(page, 'utf8') !== readFileSync(fixture, 'utf8')) {
    throw new Error('Evidence route changed; refusing to remove it.');
  }
  unlinkSync(page);
  rmdirSync(route);
}
