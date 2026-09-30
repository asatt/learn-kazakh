// Builds site/data/words.json from the Markdown tables in words/ and site/data/rules.json from the pages in rules/.
//
// Each words/*.md file is one category: the first H1 heading is the category name, and every table row after the
// header and separator rows is one word pair. Columns are matched by header name (see COLUMNS), so their order is
// free and only the Kazakh and Russian columns are required. An optional numeric prefix such as "01-" sets the
// category order and is dropped from the category ID.
//
// Each word also gets an "audio" path whose file name hashes the tts.json settings and the Kazakh text, so
// scripts/tts.py regenerates a file only when the word or the voice changes.
//
// Each rules/*.md file is one grammar rule, named by its "# Title" line and written in the Markdown subset that
// scripts/markdown.mjs parses. A word links to rules through the optional "Правило" column, such as "plural" or
// "plural#исключения", and each rule lists the words that link to it. The file name sets the rule ID the same way
// it sets the category ID.
//
// Malformed rows and links to missing rules or sections fail the build; duplicate Kazakh words only produce a
// warning because the same word can legitimately belong to several categories.

import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseMarkdown, plainText, slugify, splitRow } from './markdown.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wordsDir = path.join(root, 'words');
const rulesDir = path.join(root, 'rules');
const dataDir = path.join(root, 'site', 'data');

const ttsFile = path.join(root, 'tts.json');

const SEPARATOR_CELL = /^:?-+:?$/;

// Accepted header names (compared case-insensitively) for each field in words.json.
const COLUMNS = {
  kk: ['қазақша', 'казахский', 'kazakh'],
  tr: ['транскрипция', 'transcription'],
  ru: ['русский', 'russian'],
  note: ['заметка', 'примечание', 'note', 'notes'],
  rule: ['правило', 'правила', 'rule', 'rules'],
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

    const row = { kk: '', tr: '', ru: '', note: '', rule: '' };
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

async function markdownFiles(dir) {
  try {
    return (await readdir(dir)).filter((f) => f.endsWith('.md')).sort();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

// "05-colors.md" → "colors".
function fileId(file) {
  return file.replace(/\.md$/, '').replace(/^\d+-/, '');
}

// Resolves "plural" or "plural#section" to a rule and a section ID. Inside a rule page, "#section" refers to that
// rule. Section names are compared after slugify(), so "plural#Исключения" works too.
function resolveRule(ref, rules, fromRule) {
  const [id, section = ''] = ref.split('#');
  const ruleId = id || fromRule;
  if (!ruleId) return { error: `"${ref}" needs a rule ID before "#"` };
  const rule = rules.get(ruleId);
  if (!rule) return { error: `unknown rule "${ruleId}"; the rules are: ${[...rules.keys()].join(', ') || 'none yet'}` };
  const sectionId = slugify(section);
  if (sectionId && !rule.sections.has(sectionId)) {
    return {
      error: `rule "${ruleId}" has no section "${section}"; its sections are: ${[...rule.sections.keys()].join(', ') || 'none'}`,
    };
  }
  return { rule, section: sectionId };
}

async function buildRules(errors, warnings) {
  const rules = new Map();
  for (const file of await markdownFiles(rulesDir)) {
    const relative = `rules/${file}`;
    const id = fileId(file);
    const parsed = parseMarkdown(await readFile(path.join(rulesDir, file), 'utf8'), relative);
    errors.push(...parsed.errors);
    if (rules.has(id)) {
      errors.push(`${relative}: rule ID "${id}" is already used by rules/${rules.get(id).file}; rename one file`);
      continue;
    }
    if (!parsed.title) warnings.push(`${relative}: no "# Title" found, using "${id}" as the rule title`);
    const intro = parsed.blocks.find((block) => block.type === 'paragraph');
    rules.set(id, {
      id,
      file,
      title: parsed.title ?? id,
      summary: intro ? plainText(intro.content) : '',
      blocks: parsed.blocks,
      sections: parsed.sections,
      links: parsed.links,
      words: [],
    });
  }

  // Links to other sites stay as they are; links to rules become { rule, section } so the page builds the URL.
  for (const rule of rules.values()) {
    for (const { link, where } of rule.links) {
      if (/^https?:\/\//i.test(link.href)) continue;
      if (/^[a-z][a-z\d+.-]*:/i.test(link.href)) {
        errors.push(`${where}: link "${link.href}" must start with https:// or name a rule, such as "plural#section"`);
        continue;
      }
      const { error, rule: target, section } = resolveRule(link.href, rules, rule.id);
      if (error) {
        errors.push(`${where}: ${error}`);
        continue;
      }
      delete link.href;
      Object.assign(link, { rule: target.id, section });
    }
  }
  return rules;
}

async function buildWords(rules, errors, warnings) {
  const tts = JSON.parse(await readFile(ttsFile, 'utf8'));
  const categories = [];
  const words = [];
  const seen = new Map();

  for (const file of await markdownFiles(wordsDir)) {
    const relative = `words/${file}`;
    const parsed = parseFile(await readFile(path.join(wordsDir, file), 'utf8'), relative);
    const id = fileId(file);
    errors.push(...parsed.errors);
    const clash = categories.find((cat) => cat.id === id);
    if (clash) errors.push(`${relative}: category ID "${id}" is already used by words/${clash.file}; rename one file`);

    if (!parsed.name) warnings.push(`${relative}: no "# Heading" found, using "${id}" as the category name`);
    if (!parsed.rows.length) warnings.push(`${relative}: no word pairs found`);
    categories.push({ id, file, name: parsed.name ?? id, count: parsed.rows.length });

    for (const { kk, tr, ru, note, rule: refs, where } of parsed.rows) {
      const key = kk.toLowerCase();
      if (seen.has(key)) warnings.push(`${where}: "${kk}" is also defined at ${seen.get(key)}`);
      else seen.set(key, where);
      const word = { kk, tr, ru, note, category: id, audio: audioPath(tts, kk), rules: [] };

      for (const ref of refs.split(',').map((part) => part.trim()).filter(Boolean)) {
        const { error, rule, section } = resolveRule(ref, rules);
        if (error) {
          errors.push(`${where}: ${error}`);
          continue;
        }
        const title = section ? `${rule.title}: ${rule.sections.get(section)}` : rule.title;
        word.rules.push({ id: rule.id, section, title });
        rule.words.push({ kk, tr, ru, audio: word.audio });
      }
      words.push(word);
    }
  }

  return { categories, words };
}

// Returns the contents of site/data/words.json and site/data/rules.json.
export async function buildSite() {
  const errors = [];
  const warnings = [];
  const rules = await buildRules(errors, warnings);
  const words = await buildWords(rules, errors, warnings);
  const pages = [...rules.values()].map(({ id, title, summary, blocks, words: linked }) => ({
    id,
    title,
    summary,
    blocks,
    words: linked,
  }));
  return { words, rules: { rules: pages }, errors, warnings };
}

async function main() {
  const { words, rules, errors, warnings } = await buildSite();
  for (const warning of warnings) console.warn(`warning: ${warning}`);
  if (errors.length) {
    for (const error of errors) console.error(`error: ${error}`);
    console.error(`Build failed with ${errors.length} error(s). Fix the lines above and run the build again.`);
    process.exit(1);
  }

  await mkdir(dataDir, { recursive: true });
  await writeFile(path.join(dataDir, 'words.json'), `${JSON.stringify(words, null, 2)}\n`);
  await writeFile(path.join(dataDir, 'rules.json'), `${JSON.stringify(rules, null, 2)}\n`);
  const ruleCount = `${rules.rules.length} ${rules.rules.length === 1 ? 'rule' : 'rules'}`;
  console.log(
    `Wrote ${words.words.length} words in ${words.categories.length} categories and ${ruleCount} ` +
      `to ${path.relative(root, dataDir)}`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
