// Theme toggle that cycles Auto → Light → Dark. "Auto" follows the operating system setting.
// An inline script in each page's <head> applies the saved theme before first paint to avoid a flash.

import { storage } from './data.js';

const STORAGE_KEY = 'lk.theme';
const MODES = ['auto', 'light', 'dark'];
const LABELS = { auto: '◐ Auto', light: '☀ Light', dark: '☾ Dark' };

export function initThemeToggle(button) {
  let mode = storage.get(STORAGE_KEY, 'auto');
  if (!MODES.includes(mode)) mode = 'auto';

  const apply = () => {
    if (mode === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = mode;
    button.textContent = LABELS[mode];
    button.title = `Theme: ${mode}. Click to change.`;
  };

  button.addEventListener('click', () => {
    mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
    if (mode === 'auto') storage.remove(STORAGE_KEY);
    else storage.set(STORAGE_KEY, mode);
    apply();
  });
  apply();
}
