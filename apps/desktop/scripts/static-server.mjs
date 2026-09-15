import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const distRoot = process.argv[2];
const port = Number(process.argv[3] ?? '14999');

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    const safe = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
    const filePath = join(distRoot, safe);
    const data = await readFile(filePath);
    const type = mime[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`STATIC_SERVER_READY http://127.0.0.1:${port} root=${distRoot}`);
});
