// Stamps the site with a build version before deploy, so a browser never mixes files from two deploys.
//
// GitHub Pages lets browsers cache every file for 10 minutes, and phone browsers often keep them longer. Without a
// version, a cached old page can run with new scripts and break. This script:
//
// - appends "?v=<version>" to every script and stylesheet link in site/*.html and to every import in site/js/*.js, so
//   each deploy loads its own copy of the files;
// - writes the version into the <meta name="build"> tag of each page and into BUILD in site/js/data.js; data.js
//   reloads the page when the two differ (see checkBuild() there).
//
// The version is a hash of site/js/ and site/css/, so a deploy that changes neither keeps the cached files.
//
// The files are rewritten in place. CI runs this on its own checkout; running it locally leaves changes to revert.

import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const siteDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');

async function listFiles(dir, ext) {
  return (await readdir(path.join(siteDir, dir)))
    .filter((f) => f.endsWith(ext))
    .sort()
    .map((f) => path.posix.join(dir, f));
}

// Applies each [pattern, replacement] to the file and fails if a pattern matches nothing, so a changed markup or
// import style can't silently turn the stamping off.
async function rewrite(file, replacements) {
  const full = path.join(siteDir, file);
  let text = await readFile(full, 'utf8');
  for (const [pattern, replacement] of replacements) {
    if (text.search(pattern) === -1) throw new Error(`site/${file}: nothing matches ${pattern}`);
    text = text.replace(pattern, replacement);
  }
  await writeFile(full, text);
}

const assets = [...(await listFiles('js', '.js')), ...(await listFiles('css', '.css'))];
const hash = createHash('sha256');
for (const file of assets) hash.update(file).update('\0').update(await readFile(path.join(siteDir, file)));
const version = hash.digest('hex').slice(0, 12);

for (const file of await listFiles('.', '.html')) {
  await rewrite(file, [
    [/(<(?:script|link)\b[^>]*\b(?:src|href)=")((?:js|css)\/[^"?]+)(")/g, `$1$2?v=${version}$3`],
    [/(<meta name="build" content=")dev(")/, `$1${version}$2`],
  ]);
}

const importPattern = /(\b(?:from|import)\s*)(['"])(\.\/[^'"?]+\.js)\2/g;
for (const file of await listFiles('js', '.js')) {
  const text = await readFile(path.join(siteDir, file), 'utf8');
  const replacements = [];
  if (text.search(importPattern) !== -1) replacements.push([importPattern, `$1$2$3?v=${version}$2`]);
  if (file === 'js/data.js') replacements.push([/(export const BUILD = ')dev(')/, `$1${version}$2`]);
  if (replacements.length) await rewrite(file, replacements);
}

console.log(`Stamped site/ with build ${version}`);
