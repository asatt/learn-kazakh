// Multi-select category dropdown shared by both pages. A <details> element keeps it one line tall when closed; the
// open panel floats over the page and holds one toggle button per category, so several can be picked in a row.
// The panel closes on Escape or a click outside it.

import { el } from './data.js';

// `emptyLabel` is the summary text when nothing is picked; each page decides what an empty pick means.
export function categoryPicker(details, { categories, selected, emptyLabel, onChange }) {
  let picked = new Set(selected);
  const summary = el('summary');
  const buttons = categories.map((cat) =>
    el(
      'button',
      { type: 'button', class: 'chip', onclick: () => toggle(cat.id) },
      cat.name,
      ' ',
      el('span', { class: 'count' }, String(cat.count)),
    ),
  );

  function describe() {
    if (!picked.size) return emptyLabel;
    if (picked.size === categories.length) return 'All categories';
    const names = categories.filter((cat) => picked.has(cat.id)).map((cat) => cat.name);
    return names.length <= 2 ? names.join(', ') : `${names.length} of ${categories.length} categories`;
  }

  // Updates the buttons in place rather than rebuilding them, so keyboard focus stays on the button just pressed.
  function update() {
    summary.textContent = describe();
    categories.forEach((cat, i) => buttons[i].setAttribute('aria-pressed', String(picked.has(cat.id))));
    onChange([...picked]);
  }

  function toggle(id) {
    if (picked.has(id)) picked.delete(id);
    else picked.add(id);
    update();
  }

  function set(ids) {
    picked = new Set(ids);
    update();
  }

  const action = (label, onclick, className = 'ghost small') =>
    el('button', { type: 'button', class: className, onclick }, label);

  details.classList.add('dropdown');
  details.replaceChildren(
    summary,
    el(
      'div',
      { class: 'dropdown-panel' },
      el('div', { class: 'chips', role: 'group', 'aria-label': 'Categories' }, buttons),
      el(
        'div',
        { class: 'actions' },
        action('Select all', () => set(categories.map((cat) => cat.id))),
        action('Clear', () => set([])),
        el('span', { class: 'spacer' }),
        action('Done', () => (details.open = false), 'small'),
      ),
    ),
  );

  // On the quiz page the picker sits near the bottom of the form, so bring the opened panel on screen.
  details.addEventListener('toggle', () => {
    if (details.open) details.querySelector('.dropdown-panel').scrollIntoView({ block: 'nearest' });
  });
  document.addEventListener('pointerdown', (event) => {
    if (details.open && !details.contains(event.target)) details.open = false;
  });
  details.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && details.open) {
      event.stopPropagation();
      details.open = false;
      summary.focus();
    }
  });

  update();
}
