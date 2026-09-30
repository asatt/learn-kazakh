// Serves site/ on http://localhost:8000 for local preview.
//
// data/words.json and data/rules.json are rebuilt from words/ and rules/ on every request, so you can edit a Markdown
// file and reload the page.
// Set PORT to use a different port.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSite } from './build.mjs';

const siteDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const port = Number(process.env.PORT ?? 8000);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
};

// Maps each generated file to its key in the buildSite() result.
const DATA_FILES = { '/data/words.json': 'words', '/data/rules.json': 'rules' };

async function serveData(res, key) {
  const { errors, warnings, ...data } = await buildSite();
  for (const warning of warnings) console.warn(`warning: ${warning}`);
  if (errors.length) {
    for (const error of errors) console.error(`error: ${error}`);
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(errors.join('\n'));
    return;
  }
  res.writeHead(200, { 'content-type': TYPES['.json'] });
  res.end(JSON.stringify(data[key]));
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (DATA_FILES[pathname]) return serveData(res, DATA_FILES[pathname]);

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
