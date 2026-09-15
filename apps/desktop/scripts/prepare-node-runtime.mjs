import { chmodSync, copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const runtimeDirectory = join(desktopRoot, 'runtime-dist');
const runtimeName = process.platform === 'win32' ? 'node.exe' : 'node';
const destination = join(runtimeDirectory, runtimeName);

mkdirSync(runtimeDirectory, { recursive: true });
copyFileSync(process.execPath, destination);
if (process.platform !== 'win32') chmodSync(destination, 0o755);

console.log(`Prepared bundled Node runtime at ${destination}`);
