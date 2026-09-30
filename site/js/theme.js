// Theme toggle that cycles Auto → Light → Dark. "Auto" follows the operating system setting.
// theme-init.js applies the saved theme before first paint to avoid a flash.

import { el, storage } from './data.js';

const STORAGE_KEY = 'lk.theme';
const MODES = ['auto', 'light', 'dark'];
const ICONS = { auto: '◐', light: '☀', dark: '☾' };
const LABELS = { auto: 'Auto', light: 'Light', dark: 'Dark' };

export function initThemeToggle(button) {
  let mode = storage.get(STORAGE_KEY, 'auto');
  if (!MODES.includes(mode)) mode = 'auto';

  const apply = () => {
    if (mode === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = mode;
    // Narrow screens hide the label and show only the icon, so the button carries its name in aria-label.
    button.replaceChildren(ICONS[mode], el('span', { class: 'theme-label' }, LABELS[mode]));
    button.title = `Theme: ${mode}. Click to change.`;
    button.setAttribute('aria-label', `Theme: ${LABELS[mode]}`);
  };

  button.addEventListener('click', () => {
    mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
    if (mode === 'auto') storage.remove(STORAGE_KEY);
    else storage.set(STORAGE_KEY, mode);
    apply();
  });
  apply();
}
