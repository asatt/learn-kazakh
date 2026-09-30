// Data loading, text matching, storage, and DOM helpers shared by all pages.

// Kazakh-specific letters mapped to the closest Russian letter, so "кыз" still finds "қыз".
const KAZAKH_FOLD = { ә: 'а', ғ: 'г', қ: 'к', ң: 'н', ө: 'о', ұ: 'у', ү: 'у', һ: 'х', і: 'и' };

// Replaced with the deploy's version by scripts/stamp.mjs, together with <meta name="build"> in every page.
export const BUILD = 'dev';
const RELOAD_KEY = 'lk.reloaded-for-build';

// A page cached from an earlier deploy can run with newer scripts and break, because it lacks elements they need.
// When the page's build differs from the scripts' build, reload once to fetch the current page. The session flag
// stops a reload loop if the server keeps sending the old page.
function checkBuild() {
  const pageBuild = document.querySelector('meta[name="build"]')?.content;
  if (pageBuild === BUILD) {
    try {
      sessionStorage.removeItem(RELOAD_KEY);
    } catch {
      // Nothing to clear without sessionStorage.
    }
    return;
  }
  // Without sessionStorage there is no loop guard, so the page doesn't reload.
  let reloaded = true;
  try {
    const done = sessionStorage.getItem(RELOAD_KEY) === BUILD;
    if (!done) sessionStorage.setItem(RELOAD_KEY, BUILD);
    reloaded = done;
  } catch {
    // Keep reloaded = true.
  }
  if (reloaded) {
    const message = el('p', { class: 'error' }, 'This page is out of date. Reload it to get the latest version.');
    (document.querySelector('main') ?? document.body).prepend(message);
  } else {
    location.reload();
  }
  // Stops the page scripts, which import this module.
  throw new Error(`Page build ${pageBuild ?? 'none'} does not match script build ${BUILD}.`);
}

// Errors from loadJson() already say what to do; any other error is a bug or a stale file.
class LoadError extends Error {}

export function errorMessage(error) {
  return error instanceof LoadError ? error.message : `Cannot show this page: ${error.message}. Reload to try again.`;
}

async function loadJson(url) {
  let res;
  try {
    res = await fetch(url, { cache: 'no-cache' });
  } catch {
    throw new LoadError(`Cannot load ${url}. Check your connection and reload.`);
  }
  if (res.status === 404) throw new LoadError(`Cannot find ${url}. Run "node scripts/build.mjs" and reload.`);
  if (!res.ok) throw new LoadError(`Cannot load ${url} (HTTP ${res.status}). Reload to try again.`);
  try {
    return await res.json();
  } catch {
    throw new LoadError(`${url} is not valid JSON. Run "node scripts/build.mjs" and reload.`);
  }
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

checkBuild();
