// Dictionary search. Each word of the query is looked up on its own and the results are combined, so
// "высокое здание" finds both "биік" and "ғимарат". A query word finds an entry when it is:
//
// - part of the entry's text, as typed;
// - another form of a Russian word in the entry: "высокое" finds "высокий";
// - a near miss, tried only when nothing else matches that query word: "кышкентай" finds "кішкентай".

import { fold } from './data.js';

// A query word shorter than this must equal a whole word when the query has several words. Otherwise the "з" in
// "высокое з", typed on the way to "здание", would match every entry that contains the letter.
const MIN_PARTIAL = 3;
// Two Russian words count as forms of one word when they share at least this many leading letters and both
// remainders are endings.
const MIN_STEM = 3;

// Russian noun, adjective, and present-tense verb endings. Past-tense endings are left out: with "ла", "стола"
// would find "стоит".
const ENDINGS = new Set(
  (
    'а я о е ы и у ю ь й ой ый ий ая яя ое ее ые ие ую юю ом ем ам ям ах ях ов ев ей ою ею ью ия ию ием иях иям ' +
    'ого его ому ему ым им ых их ыми ими ами ями ть ать ять ить еть ет ит ут ют ат ят ешь ишь ете ите'
  ).split(' '),
).add('');

// Letters a Russian speaker is likely to type for a Kazakh sound that fold() maps differently: "ы" for "і".
function foldSounds(word) {
  return word.replace(/ы/g, 'и').replace(/э/g, 'е');
}

function maxEdits(length) {
  if (length < 4) return 0;
  return length < 8 ? 1 : 2;
}

function sameWord(a, b) {
  let stem = 0;
  while (stem < a.length && stem < b.length && a[stem] === b[stem]) stem += 1;
  return stem >= MIN_STEM && ENDINGS.has(a.slice(stem)) && ENDINGS.has(b.slice(stem));
}

// The fewest edits that turn the token into the beginning of the word, so a typo in a half-typed word still
// matches. An edit inserts, deletes, or replaces a letter, or swaps two neighbors.
function prefixDistance(token, word) {
  let beforePrev = [];
  let prev = Array.from({ length: word.length + 1 }, (_, j) => j);
  for (let i = 1; i <= token.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= word.length; j += 1) {
      const same = token[i - 1] === word[j - 1];
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (same ? 0 : 1));
      if (i > 1 && j > 1 && token[i - 1] === word[j - 2] && token[i - 2] === word[j - 1]) {
        row[j] = Math.min(row[j], beforePrev[j - 2] + 1);
      }
    }
    beforePrev = prev;
    prev = row;
  }
  // prev[j] is the distance to the first j letters of the word.
  return Math.min(...prev);
}

function matchesAsTyped(token, index, wholeWord) {
  if (wholeWord) return index.words.includes(token);
  return index.text.includes(token) || index.ruWords.some((word) => sameWord(token, word));
}

function matchesNearly(token, index) {
  const limit = maxEdits(token.length);
  return index.sounds.some((word) => prefixDistance(token, word) <= limit);
}

// Prepares a dictionary entry for findWords().
export function searchIndex(word) {
  const kk = fold(word.kk);
  const ru = fold(`${word.ru} ${word.note}`);
  const words = [...new Set(`${kk} ${ru}`.split(' ').filter(Boolean))];
  return {
    text: `${kk} ${ru}`,
    words,
    // The note can hold Kazakh words too. They are harmless here: a false match needs a Russian-looking ending.
    ruWords: [...new Set(ru.split(' ').filter(Boolean))],
    sounds: [...new Set(words.map(foldSounds))],
  };
}

// Returns the entries that match any word of the query, or null when the query has no letters.
// Every entry needs a "search" property made by searchIndex().
export function findWords(query, entries) {
  const tokens = [...new Set(fold(query).split(' ').filter(Boolean))];
  if (!tokens.length) return null;

  const found = new Set();
  for (const token of tokens) {
    const wholeWord = tokens.length > 1 && token.length < MIN_PARTIAL;
    let matches = entries.filter((entry) => matchesAsTyped(token, entry.search, wholeWord));
    if (!matches.length && token.length >= MIN_PARTIAL) {
      const sounds = foldSounds(token);
      matches = entries.filter((entry) => matchesNearly(sounds, entry.search));
    }
    for (const entry of matches) found.add(entry);
  }
  return found;
}
