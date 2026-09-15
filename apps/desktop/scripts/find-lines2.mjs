import { readFileSync } from 'node:fs';
const p = 'D:/Hackson/project build/apps/desktop/visual-lab/theme-boards/board.html';
const lines = readFileSync(p, 'utf8').split('\n');
for (const i of [968, 969, 970, 971, 972, 1035, 1036, 1037, 1038, 1085, 1086, 1087, 1088, 1089, 1090]) {
  console.log(`${i + 1}: ${JSON.stringify(lines[i])}`);
}
