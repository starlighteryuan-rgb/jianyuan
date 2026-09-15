// Drive headless Chrome via CDP to click each Phase 9 sidebar space and screenshot it.
// This renders the exact same dist bundle that is embedded in the native exe.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';

const desktopRoot = 'D:\\Hackson\\project build\\apps\\desktop';
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const outputRoot = `${desktopRoot}\\scripts\\probe-out`;
const screenshotRoot = `${outputRoot}\\shots`;
const httpPort = 14999;
const cdpPort = 9223;
const pageUrl = `http://127.0.0.1:${httpPort}/index.html`;

const spaceLabels = {
  records: '\u8bb0\u5f55',
  awareness: '\u89c9\u5bdf',
  reflection: '\u7406\u89e3',
  exploration: '\u63a2\u7d22',
  settings: '\u8bbe\u7f6e',
};

mkdirSync(screenshotRoot, { recursive: true });

const staticServer = spawn(process.execPath, [
  `${desktopRoot}\\scripts\\static-server.mjs`,
  `${desktopRoot}\\dist`,
  String(httpPort),
], { stdio: ['ignore', 'pipe', 'pipe'] });
staticServer.stdout.on('data', (data) => process.stdout.write(`[server] ${data}`));

const chrome = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=${outputRoot}\\chrome-cdp-profile2`,
  '--window-size=1440,900',
  '--hide-scrollbars',
  'about:blank',
], { stdio: ['ignore', 'ignore', 'ignore'] });

await sleep(1500);

async function getDebuggerUrl() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
      if (response.ok) {
        const payload = await response.json();
        return payload.webSocketDebuggerUrl;
      }
    } catch {
      // Chrome is not ready yet.
    }
    await sleep(250);
  }
  throw new Error('CDP endpoint did not become ready.');
}

const webSocket = new WebSocket(await getDebuggerUrl());
await new Promise((resolve, reject) => {
  webSocket.onopen = resolve;
  webSocket.onerror = reject;
});

let nextMessageId = 0;
const pendingMessages = new Map();
const pageLoadWaiters = [];
let pageSessionId;

webSocket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pendingMessages.has(message.id)) {
    const { resolve, reject } = pendingMessages.get(message.id);
    pendingMessages.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
  }
  if (message.method === 'Page.loadEventFired' && message.sessionId === pageSessionId) {
    for (const resolve of pageLoadWaiters.splice(0)) resolve();
  }
};

function send(method, params = {}, usePageSession = false) {
  return new Promise((resolve, reject) => {
    nextMessageId += 1;
    const messageId = nextMessageId;
    pendingMessages.set(messageId, { resolve, reject });
    const payload = { id: messageId, method, params };
    if (usePageSession) payload.sessionId = pageSessionId;
    webSocket.send(JSON.stringify(payload));
  });
}

const sendToPage = (method, params = {}) => send(method, params, true);

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const attached = await send('Target.attachToTarget', { targetId, flatten: true });
pageSessionId = attached.sessionId;

await sendToPage('Page.enable');
await sendToPage('Runtime.enable');
await sendToPage('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});

async function navigate(url) {
  const loaded = new Promise((resolve) => pageLoadWaiters.push(resolve));
  await sendToPage('Page.navigate', { url });
  await loaded;
  await sleep(1500);
}

async function evaluate(expression) {
  const result = await sendToPage('Runtime.evaluate', { expression, returnByValue: true });
  return result.result?.value;
}

async function capture(name) {
  const { data } = await sendToPage('Page.captureScreenshot', { format: 'png' });
  const image = Buffer.from(data, 'base64');
  await writeFile(`${screenshotRoot}\\${name}`, image);
  console.log(`shot ${name} (${image.length} bytes)`);
}

async function clickSpace(spaceId) {
  const label = spaceLabels[spaceId] ?? spaceId;
  return evaluate(`(() => {
    const wanted = ${JSON.stringify(label)};
    const buttons = Array.from(document.querySelectorAll('.desktop-nav-link'));
    const target = buttons.find((button) => {
      const heading = button.querySelector('strong');
      return heading && heading.textContent.trim().indexOf(wanted) === 0;
    });
    if (target) {
      target.click();
      return 'clicked:' + wanted;
    }
    return 'notfound:' + wanted + ' buttons=' + buttons.length;
  })()`);
}

const readActiveSpace = () => evaluate(
  "document.querySelector('main')?.getAttribute('data-active-space') ?? 'none'",
);

const readVisibility = () => evaluate(`(() => {
  const main = document.querySelector('main');
  const active = main?.getAttribute('data-active-space');
  const sections = Array.from(main?.querySelectorAll('[data-space]') ?? []);
  const shown = sections.filter((section) => getComputedStyle(section).display !== 'none');
  return JSON.stringify({
    active,
    visibleSpaces: shown.map((section) => section.getAttribute('data-space')),
    firstHeading: shown[0]?.querySelector('h2')?.textContent ?? '',
  });
})()`);

try {
  await navigate(pageUrl);
  console.log('nav labels =', await evaluate(
    "JSON.stringify(Array.from(document.querySelectorAll('.desktop-nav-link strong')).map((element) => element.textContent))",
  ));
  console.log('initial active space =', await readActiveSpace());
  console.log('initial visibility =', await readVisibility());
  await capture('space-01-records.png');

  const visitOrder = ['awareness', 'reflection', 'exploration', 'settings'];
  let index = 2;
  for (const spaceId of visitOrder) {
    const clickResult = await clickSpace(spaceId);
    await sleep(700);
    console.log(
      `click ${spaceId} -> ${clickResult} | active = ${await readActiveSpace()} | visibility = ${await readVisibility()}`,
    );
    await capture(`space-0${index}-${spaceId}.png`);
    index += 1;
  }
} finally {
  try { webSocket.close(); } catch {}
  try { chrome.kill(); } catch {}
  try { staticServer.kill(); } catch {}
}

console.log('DONE');
