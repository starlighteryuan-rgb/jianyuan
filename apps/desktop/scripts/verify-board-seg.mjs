// Verify the settings segmented control is per-column correct, and check cache state.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = 'D:\\Hackson\\project build\\apps\\desktop\\visual-lab\\theme-boards\\';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const HTTP_PORT = 14996;
const CDP_PORT = 9335;

let hits = 0;
const server = createServer(async (req, res) => {
  hits++;
  const data = await readFile(join(here, 'board.html'));
  // force no caching so every run gets fresh markup
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store, no-cache, must-revalidate',
    'pragma': 'no-cache',
    'expires': '0',
  });
  res.end(data);
});
await new Promise((r) => server.listen(HTTP_PORT, '127.0.0.1', r));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${join(here, 'out', 'chrome-verify-profile')}`,
  '--window-size=2400,1400', '--force-device-scale-factor=1', '--lang=zh-CN',
  '--disk-cache-size=1', 'about:blank',
], { stdio: ['ignore', 'ignore', 'ignore'] });

async function getWsUrl() {
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`); if (r.ok) return (await r.json()).webSocketDebuggerUrl; } catch {}
    await sleep(250);
  }
  throw new Error('no CDP');
}
const ws = new WebSocket(await getWsUrl());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let msgId = 0; const pending = new Map();
ws.onmessage = (ev) => {
  const d = JSON.parse(ev.data);
  if (d.id && pending.has(d.id)) { const { resolve, reject } = pending.get(d.id); pending.delete(d.id); d.error ? reject(new Error(JSON.stringify(d.error))) : resolve(d.result); }
};
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = ++msgId; pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
});
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p = {}) => send(m, p, sessionId);
await S('Page.enable'); await S('Runtime.enable'); await S('Network.enable');
await S('Network.setCacheDisabled', { cacheDisabled: true });

await S('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/?pair=A` });
for (let i = 0; i < 60; i++) {
  const r = await S('Runtime.evaluate', { expression: 'window.__BOARD_READY__ === true', returnByValue: true });
  if (r.result?.value === true) break;
  await sleep(250);
}
await sleep(600);

const report = await S('Runtime.evaluate', {
  expression: `(() => {
    const cols = Array.from(document.querySelectorAll('.col'));
    return JSON.stringify(cols.map((c) => {
      const seg = c.querySelector('[data-seg="theme"]');
      const on = seg ? Array.from(seg.querySelectorAll('button')).filter(b => b.classList.contains('on')).map(b => b.textContent) : [];
      return { theme: c.dataset.theme, segFound: !!seg, selected: on };
    }));
  })()`,
  returnByValue: true,
});
console.log('server hits:', hits);
console.log('segmented control state per column:');
console.log(report.result?.value);

ws.close(); chrome.kill(); server.close();
