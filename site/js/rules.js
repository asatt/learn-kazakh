// Rules page: the list of rules, or a single rule when the URL hash names it, such as rules.html#plural.
// A hash such as #plural/исключения also scrolls to that section, because section headings use it as their ID.
// Rule bodies come from scripts/markdown.mjs as plain data and are built here with DOM calls.

import { speakButton } from './audio.js';
import { el, loadRules, ruleHref } from './data.js';
import { initThemeToggle } from './theme.js';

const content = document.getElementById('content');
const PAGE_TITLE = document.title;

let rules = [];

function plural(count) {
  return `${count} ${count === 1 ? 'word' : 'words'}`;
}

function renderInline(nodes) {
  return nodes.map((node) => {
    if (typeof node === 'string') return node;
    if (node.type === 'strong') return el('strong', {}, renderInline(node.content));
    if (node.type === 'em') return el('em', {}, renderInline(node.content));
    if (node.type === 'code') return el('code', {}, node.text);
    if (node.rule) return el('a', { href: ruleHref(node.rule, node.section) }, renderInline(node.content));
    return el('a', { href: node.href, class: 'external' }, renderInline(node.content));
  });
}

function renderCell(tag, cell, align) {
  return el(tag, { class: align === 'left' ? null : `align-${align}` }, renderInline(cell));
}

function renderBlock(block, ruleId) {
  switch (block.type) {
    case 'heading': {
      const id = `${ruleId}/${block.id}`;
      return el(
        `h${block.level}`,
        { id },
        renderInline(block.content),
        el('a', { class: 'anchor', href: `#${id}`, 'aria-label': 'Link to this section' }, '#'),
      );
    }
    case 'paragraph':
      return el('p', {}, renderInline(block.content));
    case 'list':
      return el(block.ordered ? 'ol' : 'ul', {}, block.items.map((item) => el('li', {}, renderInline(item))));
    case 'table':
      return el(
        'div',
        { class: 'table-wrap' },
        el(
          'table',
          {},
          el('thead', {}, el('tr', {}, block.head.map((cell, i) => renderCell('th', cell, block.align[i])))),
          el(
            'tbody',
            {},
            block.rows.map((row) => el('tr', {}, row.map((cell, i) => renderCell('td', cell, block.align[i])))),
          ),
        ),
      );
    case 'quote':
      return el('blockquote', {}, block.blocks.map((inner) => renderBlock(inner, ruleId)));
    case 'code':
      return el('pre', {}, el('code', {}, block.text));
    case 'hr':
      return el('hr');
    default:
      return null;
  }
}

function renderWord(word) {
  return el(
    'li',
    { class: 'word' },
    speakButton(word) ?? el('span'),
    el(
      'span',
      { class: 'kk' },
      el('span', { lang: 'kk' }, word.kk),
      word.tr && ' ',
      word.tr && el('span', { class: 'tr' }, word.tr),
    ),
    el('span', { class: 'ru', lang: 'ru' }, word.ru),
  );
}

function renderIndex(missingId) {
  document.title = PAGE_TITLE;
  const list = rules.length
    ? el(
        'ul',
        { class: 'rule-list' },
        rules.map((rule) =>
          el(
            'li',
            {},
            el(
              'a',
              { class: 'rule-card', href: ruleHref(rule.id) },
              el('span', { class: 'rule-title', lang: 'ru' }, rule.title),
              rule.summary && el('span', { class: 'rule-summary', lang: 'ru' }, rule.summary),
              rule.words.length > 0 && el('span', { class: 'muted small' }, plural(rule.words.length)),
            ),
          ),
        ),
      )
    : el('p', { class: 'empty' }, 'No rules yet. Add a Markdown file to the rules/ folder.');

  content.replaceChildren(
    el('h1', { class: 'page-title' }, 'Rules'),
    missingId && el('p', { class: 'error' }, `There is no rule "${missingId}". Pick one from the list.`),
    list,
  );
}

function renderRule(rule) {
  document.title = `${rule.title} · ${PAGE_TITLE}`;
  content.replaceChildren(
    el('a', { class: 'back', href: 'rules.html' }, '← All rules'),
    el(
      'article',
      { class: 'panel rule', lang: 'ru' },
      el('h1', {}, rule.title),
      rule.blocks.map((block) => renderBlock(block, rule.id)),
    ),
    rule.words.length > 0 &&
      el(
        'section',
        { class: 'panel rule-words' },
        el('h2', {}, `Words that use this rule (${rule.words.length})`),
        el('ul', { class: 'word-list' }, rule.words.map(renderWord)),
      ),
  );
}

// Browsers percent-encode Cyrillic in the hash; a malformed escape is kept as typed.
function currentHash() {
  const hash = location.hash.slice(1);
  try {
    return decodeURIComponent(hash);
  } catch {
    return hash;
  }
}

function render() {
  const hash = currentHash();
  const id = hash.split('/')[0];
  const rule = rules.find((r) => r.id === id);
  if (!rule) {
    renderIndex(id);
    window.scrollTo(0, 0);
    return;
  }
  renderRule(rule);
  const section = hash.includes('/') && document.getElementById(hash);
  if (section) section.scrollIntoView();
  else window.scrollTo(0, 0);
}

initThemeToggle(document.getElementById('theme-toggle'));
window.addEventListener('hashchange', render);

try {
  ({ rules } = await loadRules());
  render();
} catch (error) {
  content.replaceChildren(el('p', { class: 'error' }, `${error.message} Run "node scripts/build.mjs" and reload.`));
}
