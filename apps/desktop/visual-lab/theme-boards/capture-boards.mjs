// Capture the three Paired Theme Boards as static PNGs.
// NON-PRODUCTION research tool. Does not touch product code or dependencies.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = join(fileURLToPath(new URL('.', import.meta.url)));
const outDir = join(here, 'out');
await mkdir(outDir, { recursive: true });

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const HTTP_PORT = 14998;
const CDP_PORT = 9333;

/* ---------- tiny static server ---------- */
const mime = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (p === '/') p = '/board.html';
    const file = join(here, normalize(p).replace(/^(\.\.[/\\])+/, ''));
    const data = await readFile(file);
    res.writeHead(200, {
      'content-type': mime[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-store, no-cache, must-revalidate',
      'pragma': 'no-cache',
      'expires': '0',
    });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});
await new Promise((r) => server.listen(HTTP_PORT, '127.0.0.1', r));

/* ---------- headless chrome + CDP ---------- */
const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--hide-scrollbars',
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${join(outDir, 'chrome-profile-' + Date.now())}`,
  '--window-size=2400,1400',
  '--force-device-scale-factor=1',
  '--lang=zh-CN',
  'about:blank',
], { stdio: ['ignore', 'ignore', 'ignore'] });

async function getWsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (res.ok) return (await res.json()).webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('CDP endpoint did not come up');
}

const ws = new WebSocket(await getWsUrl());
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

let msgId = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const d = JSON.parse(ev.data);
  if (d.id && pending.has(d.id)) {
    const { resolve, reject } = pending.get(d.id);
    pending.delete(d.id);
    if (d.error) reject(new Error(JSON.stringify(d.error)));
    else resolve(d.result);
  }
};
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = ++msgId;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
});

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = (method, params = {}) => send(method, params, sessionId);

await S('Page.enable');
await S('Runtime.enable');
await S('Network.enable');
await S('Network.setCacheDisabled', { cacheDisabled: true });
await S('Emulation.setDeviceMetricsOverride', { width: 2400, height: 1400, deviceScaleFactor: 1, mobile: false });

const pairs = ['A', 'B', 'C'];
for (const pair of pairs) {
  const url = `http://127.0.0.1:${HTTP_PORT}/board.html?pair=${pair}&cb=${Date.now()}`;
  await S('Page.navigate', { url });
  // wait for the board script to finish
  for (let i = 0; i < 60; i++) {
    const r = await S('Runtime.evaluate', { expression: 'window.__BOARD_READY__ === true', returnByValue: true });
    if (r.result?.value === true) break;
    await sleep(250);
  }
  await sleep(800); // let webfonts settle
  const layout = await S('Page.getLayoutMetrics');
  const height = Math.ceil(layout.cssContentSize?.height ?? layout.contentSize.height);
  const width = Math.ceil(layout.cssContentSize?.width ?? 2400);
  console.log(`pair ${pair}: content ${width}x${height}`);
  const shot = await S('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width, height, scale: 1 },
  });
  const file = join(outDir, `theme-board-${pair}.png`);
  await writeFile(file, Buffer.from(shot.data, 'base64'));
  console.log(`saved ${file}`);
}

ws.close();
chrome.kill();
server.close();
console.log('DONE');
