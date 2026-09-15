import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const desktop = join(here, '..');
const exePath = join(desktop, 'src-tauri', 'target', 'release', 'jianyuan-desktop.exe');
const jsPath = join(desktop, 'dist', 'assets', 'index-GFkmYFyM.js');

const exe = readFileSync(exePath);
const js = readFileSync(jsPath, 'utf8');

// Asset key name Tauri embeds (from current dist build)
const assetKey = 'index-GFkmYFyM.js';
const oldAssetKeys = ['index-', '.js'];

function countBytes(haystack, needleStr) {
  const needle = Buffer.from(needleStr, 'utf8');
  let count = 0, idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) { count++; idx += needle.length; }
  return count;
}

// Does the current renderer JS contain the Phase 9 nav labels?
const navLabels = ['记录', '觉察', '理解', '探索', '设置', 'data-active-space', 'DESKTOP_SPACES'];
console.log('=== current dist JS contains Phase 9 markers ===');
for (const label of navLabels) {
  console.log(`  ${label}: ${js.includes(label) ? 'YES' : 'NO'}`);
}

console.log('\n=== exe binary embedding check ===');
console.log(`  exe size: ${exe.length} bytes`);
console.log(`  contains current asset key "${assetKey}": ${countBytes(exe, assetKey)} occurrence(s)`);
// Tauri embeds asset paths under an assets map; also index.html
console.log(`  contains "index.html": ${countBytes(exe, 'index.html')} occurrence(s)`);
console.log(`  contains "assets/": ${countBytes(exe, 'assets/')} occurrence(s)`);
console.log(`  contains productName "见渊": ${countBytes(exe, '见渊')} occurrence(s)`);

// Brotli-compressed JS payload should NOT appear as plaintext chinese nav in exe.
console.log(`  plaintext "DESKTOP_SPACES" in exe (expect 0, it is minified+compressed): ${countBytes(exe, 'DESKTOP_SPACES')} occurrence(s)`);
