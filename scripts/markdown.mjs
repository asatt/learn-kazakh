// Parses the Markdown subset used by rules/*.md into plain data that site/js/rules.js turns into DOM nodes. The page
// can't insert HTML because the Content-Security-Policy enforces Trusted Types.
//
// Supported: one "# Title", "##" and "###" sections, paragraphs, flat bullet and numbered lists, tables, "> " quotes,
// fenced code blocks, "---" dividers, **bold**, *italic*, `code`, [links](target), and backslash escapes.
// Anything else stays plain text.
//
// Block nodes:
//   { type: 'heading', level, id, content }   id is slugify() of the heading text
//   { type: 'paragraph', content }
//   { type: 'list', ordered, items: [content] }
//   { type: 'table', align: ['left' | 'center' | 'right'], head: [content], rows: [[content]] }
//   { type: 'quote', blocks }
//   { type: 'code', text }
//   { type: 'hr' }
// Inline content is an array of strings and nodes:
//   { type: 'strong' | 'em', content }, { type: 'code', text }, { type: 'link', href, content }
//
// Links are returned unchecked in `links`; scripts/build.mjs validates them and rewrites links to other rules.

const INLINE =
  /\\([\\`*_[\]()#|>+.!-])|`([^`]+)`|\*\*(.+?)\*\*|\*([^*\s](?:.*?[^*\s])?)\*|\[([^\]]+)\]\(([^)\s]+)\)/;
const HEADING = /^(#{1,6})\s+(.+?)(?:\s+#+)?$/;
const LIST_ITEM = /^([-*+]|\d+[.)])\s+(.*)$/;
const DIVIDER = /^(?:-{3,}|\*{3,})$/;
const SEPARATOR_CELL = /^:?-+:?$/;

// Turns heading text into a section ID: "Какое окончание выбрать?" → "какое-окончание-выбрать".
export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/[\s-]+/g, '-');
}

export function plainText(content) {
  return content.map((node) => (typeof node === 'string' ? node : node.text ?? plainText(node.content))).join('');
}

// Splits a table row on pipes, keeping escaped "\|" as a literal pipe inside a cell.
export function splitRow(line) {
  return line
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

function isBlockStart(line) {
  return (
    HEADING.test(line) ||
    LIST_ITEM.test(line) ||
    DIVIDER.test(line) ||
    line.startsWith('```') ||
    line.startsWith('>') ||
    line.startsWith('|')
  );
}

function alignment(cell) {
  if (cell.startsWith(':') && cell.endsWith(':')) return 'center';
  if (cell.endsWith(':')) return 'right';
  return 'left';
}

export function parseMarkdown(text, file) {
  const errors = [];
  const links = [];
  const sections = new Map();
  let title = null;

  function parseInline(source, where) {
    const content = [];
    let plain = '';
    let rest = source;
    for (let match = rest.match(INLINE); match; match = rest.match(INLINE)) {
      plain += rest.slice(0, match.index);
      rest = rest.slice(match.index + match[0].length);
      const [, escaped, code, strong, em, label, href] = match;
      if (escaped) {
        plain += escaped;
        continue;
      }
      if (plain) content.push(plain);
      plain = '';
      if (code) content.push({ type: 'code', text: code });
      else if (strong) content.push({ type: 'strong', content: parseInline(strong, where) });
      else if (em) content.push({ type: 'em', content: parseInline(em, where) });
      else {
        const link = { type: 'link', href, content: parseInline(label, where) };
        links.push({ link, where });
        content.push(link);
      }
    }
    plain += rest;
    if (plain) content.push(plain);
    return content;
  }

  // `lines` holds { text, n } pairs so that quotes, parsed recursively, still report the line number in the file.
  function parseBlocks(lines, nested) {
    const blocks = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i].text.trim();
      const where = `${file}:${lines[i].n}`;
      if (!line) {
        i += 1;
        continue;
      }

      if (line.startsWith('```')) {
        const body = [];
        for (i += 1; i < lines.length && !lines[i].text.trim().startsWith('```'); i += 1) body.push(lines[i].text);
        if (i === lines.length) errors.push(`${where}: code block has no closing \`\`\``);
        i += 1;
        blocks.push({ type: 'code', text: body.join('\n') });
        continue;
      }

      const heading = line.match(HEADING);
      if (heading) {
        i += 1;
        const level = heading[1].length;
        if (level === 1) {
          if (title === null && !nested && !blocks.length) title = heading[2];
          else errors.push(`${where}: only the first line can be a "# Title"; use "##" or "###" for sections`);
          continue;
        }
        if (level > 3) errors.push(`${where}: use "##" or "###" for sections; deeper headings aren't supported`);
        const content = parseInline(heading[2], where);
        const id = slugify(plainText(content));
        if (!id) errors.push(`${where}: section heading needs at least one letter or digit`);
        else if (sections.has(id)) errors.push(`${where}: another section is also named "${plainText(content)}"`);
        else sections.set(id, plainText(content));
        blocks.push({ type: 'heading', level: Math.min(level, 3), id, content });
        continue;
      }

      if (DIVIDER.test(line)) {
        i += 1;
        blocks.push({ type: 'hr' });
        continue;
      }

      if (line.startsWith('>')) {
        const quoted = [];
        for (; i < lines.length && lines[i].text.trim().startsWith('>'); i += 1) {
          quoted.push({ text: lines[i].text.trim().replace(/^>\s?/, ''), n: lines[i].n });
        }
        blocks.push({ type: 'quote', blocks: parseBlocks(quoted, true) });
        continue;
      }

      if (line.startsWith('|')) {
        const start = i;
        const rows = [];
        for (; i < lines.length && lines[i].text.trim().startsWith('|'); i += 1) rows.push(splitRow(lines[i].text.trim()));
        const [head, separator = [], ...body] = rows;
        if (!separator.length || !separator.every((cell) => SEPARATOR_CELL.test(cell))) {
          errors.push(`${where}: expected a separator row like "| --- | --- |" under the table header`);
        }
        body.forEach((cells, row) => {
          if (cells.length > head.length) {
            errors.push(
              `${file}:${lines[start + 2 + row].n}: row has ${cells.length} columns, the header has ${head.length}; escape a literal pipe as \\|`,
            );
          }
        });
        blocks.push({
          type: 'table',
          align: head.map((_, column) => alignment(separator[column] ?? '')),
          head: head.map((cell) => parseInline(cell, where)),
          rows: body.map((cells, row) =>
            head.map((_, column) => parseInline(cells[column] ?? '', `${file}:${lines[start + 2 + row].n}`)),
          ),
        });
        continue;
      }

      const item = line.match(LIST_ITEM);
      if (item) {
        const ordered = /\d/.test(item[1]);
        const items = [];
        let current = null;
        while (i < lines.length) {
          const next = lines[i].text.trim();
          const nextItem = next.match(LIST_ITEM);
          if (nextItem && /\d/.test(nextItem[1]) === ordered) {
            current = { text: nextItem[2], n: lines[i].n };
            items.push(current);
          } else if (next && !isBlockStart(next)) {
            current.text += ` ${next}`;
          } else if (!next) {
            // A blank line ends the list unless another item of the same kind follows it.
            const following = lines.slice(i + 1).find((l) => l.text.trim());
            const followingItem = following?.text.trim().match(LIST_ITEM);
            if (!followingItem || /\d/.test(followingItem[1]) !== ordered) break;
          } else {
            break;
          }
          i += 1;
        }
        blocks.push({ type: 'list', ordered, items: items.map((it) => parseInline(it.text, `${file}:${it.n}`)) });
        continue;
      }

      const paragraph = [];
      for (; i < lines.length && lines[i].text.trim() && !isBlockStart(lines[i].text.trim()); i += 1) {
        paragraph.push(lines[i].text.trim());
      }
      blocks.push({ type: 'paragraph', content: parseInline(paragraph.join(' '), where) });
    }
    return blocks;
  }

  const lines = text.split(/\r?\n/).map((line, index) => ({ text: line, n: index + 1 }));
  const blocks = parseBlocks(lines, false);
  return { title, blocks, sections, links, errors };
}
