// Serves site/ on http://localhost:8000 for local preview.
//
// data/words.json is rebuilt from words/ on every request, so you can edit a Markdown file and reload the page.
// Set PORT to use a different port.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWords } from './build.mjs';

const siteDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const port = Number(process.env.PORT ?? 8000);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

async function serveWords(res) {
  const { data, errors, warnings } = await buildWords();
  for (const warning of warnings) console.warn(`warning: ${warning}`);
  if (errors.length) {
    for (const error of errors) console.error(`error: ${error}`);
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(errors.join('\n'));
    return;
  }
  res.writeHead(200, { 'content-type': TYPES['.json'] });
  res.end(JSON.stringify(data));
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname === '/data/words.json') return serveWords(res);

  const file = path.join(siteDir, decodeURIComponent(pathname.endsWith('/') ? `${pathname}index.html` : pathname));
  if (!file.startsWith(siteDir)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end(`Not found: ${pathname}`);
  }
}).listen(port, () => {
  console.log(`Serving site/ on http://localhost:${port}`);
});
