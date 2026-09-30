// Builds site/data/words.json from the Markdown tables in words/.
//
// Each words/*.md file is one category: the first H1 heading is the category name, and every table row after the
// header and separator rows is one word pair. Columns are matched by header name (see COLUMNS), so their order is
// free and only the Kazakh and Russian columns are required. An optional numeric prefix such as "01-" sets the
// category order and is dropped from the category ID.
//
// Each word also gets an "audio" path whose file name hashes the tts.json settings and the Kazakh text, so
// scripts/tts.py regenerates a file only when the word or the voice changes.
//
// Malformed rows fail the build; duplicate Kazakh words only produce a warning because the same word can
// legitimately belong to several categories.

import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wordsDir = path.join(root, 'words');
const outFile = path.join(root, 'site', 'data', 'words.json');

const ttsFile = path.join(root, 'tts.json');

const SEPARATOR_CELL = /^:?-+:?$/;

// Accepted header names (compared case-insensitively) for each field in words.json.
const COLUMNS = {
  kk: ['қазақша', 'казахский', 'kazakh'],
  tr: ['транскрипция', 'transcription'],
  ru: ['русский', 'russian'],
  note: ['заметка', 'примечание', 'note', 'notes'],
};
const KNOWN_HEADERS = Object.values(COLUMNS).flat();

// Maps header cells to field names, for example ["Қазақша", "Русский"] → ["kk", "ru"].
function parseHeader(cells, where, errors) {
  const fields = cells.map((cell) => {
    const name = cell.toLowerCase();
    const field = Object.keys(COLUMNS).find((key) => COLUMNS[key].includes(name));
    if (!field) errors.push(`${where}: unknown column "${cell}"; use one of: ${KNOWN_HEADERS.join(', ')}`);
    return field;
  });
  for (const required of ['kk', 'ru']) {
    if (!fields.includes(required)) {
      errors.push(`${where}: table has no ${required === 'kk' ? '"Қазақша"' : '"Русский"'} column`);
    }
  }
  return fields;
}

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
  let fields = [];

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
    if (tableRow === 1) {
      fields = parseHeader(cells, where, errors);
      return;
    }
    if (tableRow === 2) {
      if (!cells.every((cell) => SEPARATOR_CELL.test(cell))) {
        errors.push(`${where}: expected a separator row like "| --- | --- | --- |" under the table header`);
      }
      return;
    }

    const row = { kk: '', tr: '', ru: '', note: '' };
    fields.forEach((field, column) => {
      if (field) row[field] = cells[column] ?? '';
    });
    if (cells.length > fields.length) {
      errors.push(`${where}: row has ${cells.length} columns, the header has ${fields.length}; escape a literal pipe as \\|`);
    } else if (!row.kk || !row.ru) {
      errors.push(`${where}: row needs both a Kazakh and a Russian word`);
    } else {
      rows.push({ ...row, where });
    }
  });

  return { name, rows, errors };
}

function audioPath(tts, text) {
  const hash = createHash('sha1')
    .update(JSON.stringify([tts.voice, tts.speaker, tts.lengthScale, text]))
    .digest('hex')
    .slice(0, 16);
  return `audio/${hash}.mp3`;
}

export async function buildWords() {
  const tts = JSON.parse(await readFile(ttsFile, 'utf8'));
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
    const clash = categories.find((cat) => cat.id === id);
    if (clash) errors.push(`${relative}: category ID "${id}" is already used by words/${clash.file}; rename one file`);

    if (!parsed.name) warnings.push(`${relative}: no "# Heading" found, using "${id}" as the category name`);
    if (!parsed.rows.length) warnings.push(`${relative}: no word pairs found`);
    categories.push({ id, file, name: parsed.name ?? id, count: parsed.rows.length });

    for (const { kk, tr, ru, note, where } of parsed.rows) {
      const key = kk.toLowerCase();
      if (seen.has(key)) warnings.push(`${where}: "${kk}" is also defined at ${seen.get(key)}`);
      else seen.set(key, where);
      words.push({ kk, tr, ru, note, category: id, audio: audioPath(tts, kk) });
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
