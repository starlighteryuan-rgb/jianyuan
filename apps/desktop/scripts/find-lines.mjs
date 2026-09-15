import { readFileSync } from 'node:fs';
const p = 'D:/Hackson/project build/apps/desktop/visual-lab/theme-boards/board.html';
const lines = readFileSync(p, 'utf8').split('\n');
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  if (l.includes("row('主题'") || l.includes('const params = new URLSearchParams') || l.includes('holder.innerHTML = markup') || l.includes('wrap.appendChild(holder')) {
    console.log(`${i + 1}: ${l}`);
  }
}
