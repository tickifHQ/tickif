import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Local OFL fonts keep OG rendering independent of font CDNs at request time. */
export async function portfolioSocialFonts() {
  const [regular, bold, mono] = await Promise.all([
    readFile(join(process.cwd(), 'src/assets/fonts/Inter-Regular.ttf')),
    readFile(join(process.cwd(), 'src/assets/fonts/Inter-Bold.ttf')),
    readFile(join(process.cwd(), 'src/assets/fonts/JetBrainsMono-Regular.ttf')),
  ]);
  return [
    { name: 'Inter', data: regular, weight: 400 as const, style: 'normal' as const },
    { name: 'Inter', data: bold, weight: 700 as const, style: 'normal' as const },
    { name: 'JetBrains Mono', data: mono, weight: 400 as const, style: 'normal' as const },
  ];
}
