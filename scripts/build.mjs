// Builds site/data/words.json from the Markdown tables in words/.
//
// Each words/*.md file is one category: the first H1 heading is the category name, and every table row after the
// header and separator rows is one word pair (Kazakh | Russian | optional note). An optional numeric prefix such as
// "01-" sets the category order and is dropped from the category ID.
//
// Malformed rows fail the build; duplicate Kazakh words only produce a warning because the same word can
// legitimately belong to several categories.

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wordsDir = path.join(root, 'words');
const outFile = path.join(root, 'site', 'data', 'words.json');

const SEPARATOR_CELL = /^:?-+:?$/;

// Splits a table row on pipes, keeping escaped "\|" as a literal pipe inside a cell.
function splitRow(line) {
  return line
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

function parseFile(text, file) {
  const errors = [];
  const rows = [];
  let name = null;
  let tableRow = 0;

  text.split(/\r?\n/).forEach((rawLine, i) => {
    const line = rawLine.trim();
    const where = `${file}:${i + 1}`;

    const heading = !name && line.match(/^#\s+(.+)$/);
    if (heading) {
      name = heading[1].trim();
      return;
    }
    if (!line.startsWith('|')) {
      tableRow = 0;
      return;
    }

    tableRow += 1;
    const cells = splitRow(line);
    if (tableRow === 1) return;
    if (tableRow === 2) {
      if (!cells.every((cell) => SEPARATOR_CELL.test(cell))) {
        errors.push(`${where}: expected a separator row like "| --- | --- | --- |" under the table header`);
      }
      return;
    }

    const [kk = '', ru = '', note = ''] = cells;
    if (cells.length > 3) {
      errors.push(`${where}: row has ${cells.length} columns, expected at most 3; escape a literal pipe as \\|`);
    } else if (!kk || !ru) {
      errors.push(`${where}: row needs both a Kazakh and a Russian word`);
    } else {
      rows.push({ kk, ru, note, where });
    }
  });

  return { name, rows, errors };
}

export async function buildWords() {
  const files = (await readdir(wordsDir)).filter((f) => f.endsWith('.md')).sort();
  const categories = [];
  const words = [];
  const errors = [];
  const warnings = [];
  const seen = new Map();

  for (const file of files) {
    const relative = `words/${file}`;
    const parsed = parseFile(await readFile(path.join(wordsDir, file), 'utf8'), relative);
    const id = file.replace(/\.md$/, '').replace(/^\d+-/, '');
    errors.push(...parsed.errors);

    if (!parsed.name) warnings.push(`${relative}: no "# Heading" found, using "${id}" as the category name`);
    if (!parsed.rows.length) warnings.push(`${relative}: no word pairs found`);
    categories.push({ id, name: parsed.name ?? id, count: parsed.rows.length });

    for (const { kk, ru, note, where } of parsed.rows) {
      const key = kk.toLowerCase();
      if (seen.has(key)) warnings.push(`${where}: "${kk}" is also defined at ${seen.get(key)}`);
      else seen.set(key, where);
      words.push({ kk, ru, note, category: id });
    }
  }

  return { data: { categories, words }, errors, warnings };
}

async function main() {
  const { data, errors, warnings } = await buildWords();
  for (const warning of warnings) console.warn(`warning: ${warning}`);
  if (errors.length) {
    for (const error of errors) console.error(`error: ${error}`);
    console.error(`Build failed with ${errors.length} error(s). Fix the rows above and run the build again.`);
    process.exit(1);
  }

  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`Wrote ${data.words.length} words in ${data.categories.length} categories to ${path.relative(root, outFile)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
