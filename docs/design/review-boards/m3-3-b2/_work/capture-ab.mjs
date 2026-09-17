import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = process.cwd();
const board = resolve(projectRoot, 'apps/mobile/visual-lab/m3-3-direction-ab/index.html');
const outDir = resolve(projectRoot, 'apps/mobile/visual-lab/m3-3-direction-ab/preview');
mkdirSync(outDir, { recursive: true });

const { chromium } = await import('playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1.35 });
await page.goto(`file:///${board.replace(/\\/g, '/').replace(/ /g, '%20')}`, { waitUntil: 'networkidle' });

const sections = await page.locator('.section').all();
const picks = [
  ['board-full', null],
  ['closeup-record', '1 · Record'],
  ['closeup-record-expanded', '2 · Record Expanded'],
  ['closeup-awareness', '3 · Awareness Main'],
  ['closeup-awareness-open', '4 · Awareness Open'],
  ['closeup-understanding', '5 · Understanding'],
  ['closeup-exploration', '6 · Exploration'],
  ['closeup-search', '7 · Search Mode'],
  ['closeup-compare', '9 · A vs B2 vs AB'],
];

for (const [name, marker] of picks) {
  if (marker === null) {
    await page.locator('body').screenshot({ path: resolve(outDir, `${name}.png`) });
  } else {
    const section = page.locator('.section', { hasText: marker }).first();
    await section.screenshot({ path: resolve(outDir, `${name}.png`) });
  }
  console.log(name);
}

await browser.close();
