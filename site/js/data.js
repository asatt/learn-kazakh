// Data loading, text matching, storage, and DOM helpers shared by all pages.

// Kazakh-specific letters mapped to the closest Russian letter, so "кыз" still finds "қыз".
const KAZAKH_FOLD = { ә: 'а', ғ: 'г', қ: 'к', ң: 'н', ө: 'о', ұ: 'у', ү: 'у', һ: 'х', і: 'и' };

async function loadJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Cannot load ${url} (HTTP ${res.status}).`);
  return res.json();
}

export function loadWords() {
  return loadJson('data/words.json');
}

export function loadRules() {
  return loadJson('data/rules.json');
}

// Links to a rule on rules.html, or to one of its sections. The section heading uses "rule/section" as its ID.
export function ruleHref(id, section = '') {
  return `rules.html#${section ? `${id}/${section}` : id}`;
}

// Lowercases, treats "ё" as "е", and drops punctuation so answers compare on letters only.
export function normalize(text) {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[.,!?;:«»"'()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Like normalize(), but also replaces Kazakh-specific letters with their Russian lookalikes.
export function fold(text) {
  return normalize(text).replace(/[әғқңөұүһі]/g, (ch) => KAZAKH_FOLD[ch]);
}

// "мать, мама" accepts the whole string and each comma- or semicolon-separated part.
export function acceptedAnswers(text) {
  return [...new Set([text, ...text.split(/[,;]/)].map(normalize).filter(Boolean))];
}

export function wordKey(word) {
  return `${word.kk}|${word.ru}`;
}

export function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// localStorage can be missing or throw in private windows; every call falls back quietly.
export const storage = {
  get(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Progress is a convenience; the page works without it.
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // See set().
    }
  },
};

// Creates an element. Props starting with "on" become event listeners; children may be strings or nodes.
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) {
    if (value === false || value == null) continue;
    if (name === 'class') node.className = value;
    else if (name.startsWith('on')) node.addEventListener(name.slice(2), value);
    else node.setAttribute(name, value === true ? '' : value);
  }
  node.append(...children.flat().filter((child) => child != null && child !== false && child !== ''));
  return node;
}
