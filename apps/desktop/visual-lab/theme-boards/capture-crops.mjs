// Capture per-section crops of each Paired Theme Board at full resolution.
// NON-PRODUCTION research tool.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = join(fileURLToPath(new URL('.', import.meta.url)));
const outDir = join(here, 'out');
const cropDir = join(outDir, 'crops');
await mkdir(cropDir, { recursive: true });

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const HTTP_PORT = 14997;
const CDP_PORT = 9334;

const mime = { '.html': 'text/html; charset=utf-8' };
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (p === '/') p = '/board.html';
    const data = await readFile(join(here, normalize(p).replace(/^(\.\.[/\\])+/, '')));
    res.writeHead(200, {
      'content-type': mime[extname(p).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-store, no-cache, must-revalidate',
      'pragma': 'no-cache',
      'expires': '0',
    });
    res.end(data);
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => server.listen(HTTP_PORT, '127.0.0.1', r));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${join(outDir, 'chrome-profile-crop-' + Date.now())}`,
  '--window-size=2400,1400', '--force-device-scale-factor=1', '--lang=zh-CN', 'about:blank',
], { stdio: ['ignore', 'ignore', 'ignore'] });

async function getWsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (r.ok) return (await r.json()).webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('no CDP');
}

const ws = new WebSocket(await getWsUrl());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let msgId = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const d = JSON.parse(ev.data);
  if (d.id && pending.has(d.id)) {
    const { resolve, reject } = pending.get(d.id);
    pending.delete(d.id);
    d.error ? reject(new Error(JSON.stringify(d.error))) : resolve(d.result);
  }
};
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = ++msgId;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
});
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p = {}) => send(m, p, sessionId);
await S('Page.enable'); await S('Runtime.enable');
await S('Network.enable');
await S('Network.setCacheDisabled', { cacheDisabled: true });
await S('Emulation.setDeviceMetricsOverride', { width: 2400, height: 1400, deviceScaleFactor: 1, mobile: false });

const evalJs = async (expression) => {
  const r = await S('Runtime.evaluate', { expression, returnByValue: true });
  return r.result?.value;
};

for (const pair of ['A', 'B', 'C']) {
  await S('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/board.html?pair=${pair}&cb=${Date.now()}` });
  for (let i = 0; i < 60; i++) {
    if (await evalJs('window.__BOARD_READY__ === true')) break;
    await sleep(250);
  }
  await sleep(700);

  // Measure each .pair row plus its preceding label
  const regions = await evalJs(`(() => {
    const out = [];
    const labels = Array.from(document.querySelectorAll('.sec-label'));
    for (const l of labels) {
      const row = l.nextElementSibling;
      if (!row) continue;
      const a = l.getBoundingClientRect();
      const b = row.getBoundingClientRect();
      const top = Math.min(a.top, b.top) + window.scrollY;
      const bottom = Math.max(a.bottom, b.bottom) + window.scrollY;
      const h2 = l.querySelector('h2');
      out.push({ name: (h2 ? h2.textContent : 'section').replace(/[^0-9A-Za-z]+/g, '-').slice(0, 60), top: Math.floor(top) - 8, height: Math.ceil(bottom - top) + 24 });
    }
    const head = document.querySelector('.board-head');
    if (head) {
      const r = head.getBoundingClientRect();
      out.unshift({ name: '00-board-head', top: Math.floor(r.top + window.scrollY) - 8, height: Math.ceil(r.height) + 20 });
    }
    const specs = Array.from(document.querySelectorAll('.spec-box'));
    specs.forEach((s, i) => {
      const r = s.getBoundingClientRect();
      out.push({ name: '09-spec-' + i, top: Math.floor(r.top + window.scrollY) - 8, height: Math.ceil(r.height) + 16 });
    });
    return JSON.stringify(out);
  })()`);

  const list = JSON.parse(regions);
  console.log(`\n=== pair ${pair}: ${list.length} regions ===`);
  for (const reg of list) {
    const w = 2400;
    const h = Math.min(reg.height, 4200);
    const shot = await S('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: Math.max(0, reg.top), width: w, height: h, scale: 1 },
    });
    const file = join(cropDir, `${pair}-${reg.name}.png`);
    await writeFile(file, Buffer.from(shot.data, 'base64'));
    console.log(`  ${reg.name} y=${reg.top} h=${h}`);
  }
}

ws.close(); chrome.kill(); server.close();
console.log('\nDONE');
