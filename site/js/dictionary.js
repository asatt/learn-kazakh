// Dictionary page: search across both languages and filter by category.

import { speakButton } from './audio.js';
import { el, fold, loadWords } from './data.js';
import { initThemeToggle } from './theme.js';

const search = document.getElementById('search');
const chips = document.getElementById('chips');
const summary = document.getElementById('summary');
const results = document.getElementById('results');

let data;
let activeCategory = 'all';

function plural(count) {
  return `${count} ${count === 1 ? 'word' : 'words'}`;
}

function renderChips() {
  const options = [{ id: 'all', name: 'All', count: data.words.length }, ...data.categories];
  chips.replaceChildren(
    ...options.map((cat) =>
      el(
        'button',
        {
          type: 'button',
          class: 'chip',
          'aria-pressed': String(cat.id === activeCategory),
          onclick: () => {
            activeCategory = cat.id;
            renderChips();
            renderWords();
          },
        },
        cat.name,
        ' ',
        el('span', { class: 'count' }, String(cat.count)),
      ),
    ),
  );
}

function renderWords() {
  const query = fold(search.value);
  const categories = data.categories.filter((cat) => activeCategory === 'all' || cat.id === activeCategory);
  const sections = [];
  let total = 0;

  for (const cat of categories) {
    const words = data.words.filter((w) => w.category === cat.id && (!query || w.searchText.includes(query)));
    if (!words.length) continue;
    total += words.length;
    sections.push(
      el(
        'section',
        { class: 'category' },
        el(
          'div',
          { class: 'category-head' },
          el('h2', {}, cat.name, ' ', el('span', { class: 'count' }, String(words.length))),
          el('a', { class: 'button small secondary', href: `quiz.html?cat=${encodeURIComponent(cat.id)}` }, 'Practice'),
        ),
        el(
          'ul',
          { class: 'word-list' },
          words.map((w) =>
            el(
              'li',
              { class: 'word' },
              el(
                'span',
                { class: 'kk' },
                speakButton(w),
                el('span', {}, el('span', { lang: 'kk' }, w.kk), w.tr && el('span', { class: 'tr' }, w.tr)),
              ),
              el('span', { class: 'ru', lang: 'ru' }, w.ru),
              w.note && el('span', { class: 'note' }, w.note),
            ),
          ),
        ),
      ),
    );
  }

  results.replaceChildren(...sections);
  summary.textContent = query ? `${plural(total)} found` : plural(total);
  if (!total) {
    const message = query
      ? `No words match "${search.value.trim()}".`
      : 'No words yet. Add a Markdown table to the words/ folder.';
    results.append(el('p', { class: 'empty' }, message));
  }
}

initThemeToggle(document.getElementById('theme-toggle'));

search.addEventListener('input', renderWords);
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
  for (const word of data.words) word.searchText = fold(`${word.kk} ${word.ru} ${word.note}`);
  renderChips();
  renderWords();
} catch (error) {
  results.replaceChildren(el('p', { class: 'error' }, `${error.message} Run "node scripts/build.mjs" and reload.`));
}
