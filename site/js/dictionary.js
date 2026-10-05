// Dictionary page: categories as cards that open in place, search across both languages, and a category filter.
// Without a search or filter, only the categories you opened show their words; the open set is remembered.

import { speakButton } from './audio.js';
import { el, errorMessage, loadWords, ruleHref, storage } from './data.js';
import { categoryPicker } from './picker.js';
import { findWords, searchIndex } from './search.js';
import { initThemeToggle } from './theme.js';

const OPEN_KEY = 'lk.dictionary.open';

const search = document.getElementById('search');
const filter = document.getElementById('category-filter');
const summary = document.getElementById('summary');
const results = document.getElementById('results');
const expandAll = document.getElementById('expand-all');
const collapseAll = document.getElementById('collapse-all');

let data;
// Picked category ids; an empty list shows every category.
let picked = [];
let open = new Set(storage.get(OPEN_KEY, []));

function plural(count) {
  return `${count} ${count === 1 ? 'word' : 'words'}`;
}

function setOpen(ids) {
  open = new Set(ids);
  storage.set(OPEN_KEY, [...open]);
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
      // A plain space lets the transcription wrap to the next line without a leading indent.
      word.tr && ' ',
      word.tr && el('span', { class: 'tr' }, word.tr),
    ),
    el('span', { class: 'ru', lang: 'ru' }, word.ru),
    word.note && el('p', { class: 'note' }, el('strong', {}, 'Note:'), ' ', word.note),
    word.rules.length > 0 &&
      el(
        'p',
        { class: 'rule-links' },
        word.rules.map((rule) => el('a', { href: ruleHref(rule.id, rule.section), lang: 'ru' }, `§ ${rule.title}`)),
      ),
  );
}

// A card whose open state is forced by a search or filter has a plain header instead of a toggle button.
function renderCategory(cat, words, { expanded, forced, countText }) {
  const listId = `words-${cat.id}`;
  const title = [
    el('span', { class: 'chevron', 'aria-hidden': 'true' }, '›'),
    el('span', { class: 'category-name' }, cat.name),
    el('span', { class: 'count' }, countText),
  ];
  const toggle = forced
    ? el('div', { class: 'category-toggle' }, title.slice(1))
    : el(
        'button',
        {
          type: 'button',
          class: 'category-toggle',
          'aria-expanded': String(expanded),
          'aria-controls': listId,
          'data-category': cat.id,
          onclick: () => {
            const ids = new Set(open);
            if (ids.has(cat.id)) ids.delete(cat.id);
            else ids.add(cat.id);
            setOpen(ids);
            renderWords();
            results.querySelector(`[data-category="${CSS.escape(cat.id)}"]`)?.focus();
          },
        },
        title,
      );

  return el(
    'section',
    { class: expanded ? 'category open' : 'category' },
    el(
      'div',
      { class: 'category-head' },
      toggle,
      el('a', { class: 'button small secondary', href: `quiz.html?cat=${encodeURIComponent(cat.id)}` }, 'Practice'),
    ),
    expanded && el('ul', { class: 'word-list', id: listId }, words.map(renderWord)),
  );
}

function renderWords() {
  const found = findWords(search.value, data.words);
  const query = found !== null;
  const filtered = picked.length > 0;
  const forced = query || filtered;
  const cards = [];
  let total = 0;

  for (const cat of data.categories) {
    if (filtered && !picked.includes(cat.id)) continue;
    const all = data.words.filter((w) => w.category === cat.id);
    const words = query ? all.filter((w) => found.has(w)) : all;
    if (query && !words.length) continue;
    total += words.length;
    cards.push(
      renderCategory(cat, words, {
        expanded: forced || open.has(cat.id),
        forced,
        countText: query ? `${words.length} of ${all.length}` : String(all.length),
      }),
    );
  }

  results.replaceChildren(...cards);
  summary.textContent = query ? `${plural(total)} found` : plural(total);
  expandAll.hidden = forced || open.size === data.categories.length;
  collapseAll.hidden = forced || open.size === 0;
  if (!total) {
    const message = query
      ? `No words match "${search.value.trim()}".`
      : 'No words yet. Add a Markdown table to the words/ folder.';
    results.append(el('p', { class: 'empty' }, message));
  }
}

initThemeToggle(document.getElementById('theme-toggle'));

search.addEventListener('input', renderWords);
expandAll.addEventListener('click', () => {
  setOpen(data.categories.map((cat) => cat.id));
  renderWords();
});
collapseAll.addEventListener('click', () => {
  setOpen([]);
  renderWords();
});
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && document.activeElement !== search) {
    event.preventDefault();
    search.focus();
  } else if (event.key === 'Escape' && document.activeElement === search) {
    search.value = '';
    renderWords();
  }
});

try {
  data = await loadWords();
  // Drop categories that no longer exist, so "Expand all" and "Collapse all" count correctly.
  setOpen([...open].filter((id) => data.categories.some((cat) => cat.id === id)));
  for (const word of data.words) word.search = searchIndex(word);
  categoryPicker(filter, {
    categories: data.categories,
    selected: [],
    emptyLabel: 'All categories',
    onChange: (ids) => {
      picked = ids;
      renderWords();
    },
  });
  renderWords();
} catch (error) {
  results.replaceChildren(el('p', { class: 'error' }, errorMessage(error)));
}
