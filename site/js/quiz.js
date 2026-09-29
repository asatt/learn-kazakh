// Quiz page: multiple-choice and typing modes in either direction, with per-word progress in localStorage.

import { playWord, speakButton } from './audio.js';
import { acceptedAnswers, el, fold, loadWords, normalize, shuffle, storage, wordKey } from './data.js';
import { initThemeToggle } from './theme.js';

const SETTINGS_KEY = 'lk.quiz.settings';
const STATS_KEY = 'lk.stats';
const KAZAKH_LETTERS = ['ә', 'ғ', 'қ', 'ң', 'ө', 'ұ', 'ү', 'һ', 'і'];
const LANGUAGE_NAMES = { kk: 'Kazakh', ru: 'Russian' };

const $ = (id) => document.getElementById(id);
const setup = $('setup');
const play = $('play');
const summary = $('summary');
const answerInput = $('answer');

let data;
let stats = storage.get(STATS_KEY, {});
let settings;
let session;

// ---- Settings ----

function loadSettings() {
  const saved = storage.get(SETTINGS_KEY, {});
  const categoryIds = data.categories.map((c) => c.id);
  const fromUrl = new URLSearchParams(location.search).get('cat');
  let categories = Array.isArray(saved.categories) ? saved.categories.filter((id) => categoryIds.includes(id)) : [];
  if (categoryIds.includes(fromUrl)) categories = [fromUrl];
  if (!categories.length) categories = categoryIds;

  return {
    mode: ['choice', 'typing'].includes(saved.mode) ? saved.mode : 'choice',
    direction: ['kk-ru', 'ru-kk', 'mixed'].includes(saved.direction) ? saved.direction : 'kk-ru',
    options: String(saved.options ?? '6'),
    questionCount: String(saved.questionCount ?? '20'),
    showTranscription: saved.showTranscription ?? true,
    autoPlay: saved.autoPlay ?? false,
    categories,
  };
}

function readSettings() {
  const form = new FormData(setup);
  return {
    mode: form.get('mode'),
    direction: form.get('direction'),
    options: form.get('options'),
    questionCount: form.get('questionCount'),
    showTranscription: form.has('showTranscription'),
    autoPlay: form.has('autoPlay'),
    categories: [...setup.querySelectorAll('#category-picks input:checked')].map((input) => input.value),
  };
}

function renderSetup() {
  setup.elements.mode.value = settings.mode;
  setup.elements.direction.value = settings.direction;
  setup.elements.options.value = settings.options;
  setup.elements.questionCount.value = settings.questionCount;
  setup.elements.showTranscription.checked = settings.showTranscription;
  setup.elements.autoPlay.checked = settings.autoPlay;
  $('category-picks').replaceChildren(
    ...data.categories.map((cat) =>
      el(
        'label',
        {},
        el('input', {
          type: 'checkbox',
          value: cat.id,
          checked: settings.categories.includes(cat.id),
          onchange: updateSetupState,
        }),
        `${cat.name} `,
        el('span', { class: 'muted' }, String(cat.count)),
      ),
    ),
  );
  updateSetupState();
}

function updateSetupState() {
  const current = readSettings();
  const poolSize = data.words.filter((w) => current.categories.includes(w.category)).length;
  $('options-field').hidden = current.mode !== 'choice';
  $('start').disabled = poolSize < 2;
  $('pool-size').textContent = poolSize < 2 ? 'Select categories with at least 2 words.' : `${poolSize} words selected`;
}

// ---- Session ----

function recordResult(word, correct) {
  const key = wordKey(word);
  const entry = stats[key] ?? { correct: 0, wrong: 0 };
  if (correct) entry.correct += 1;
  else entry.wrong += 1;
  stats[key] = entry;
  storage.set(STATS_KEY, stats);
}

// Weighted sampling without replacement (Efraimidis–Spirakis): often-missed words get a higher weight.
function pickWords(pool, count) {
  const picked = pool
    .map((word) => {
      const entry = stats[wordKey(word)] ?? { correct: 0, wrong: 0 };
      const weight = Math.min(5, Math.max(0.3, (entry.wrong + 1) / (entry.correct + 1)));
      return { word, rank: Math.random() ** (1 / weight) };
    })
    .sort((a, b) => b.rank - a.rank)
    .slice(0, count)
    .map((item) => item.word);
  return shuffle(picked);
}

function makeQuestion(word, direction) {
  const dir = direction === 'mixed' ? (Math.random() < 0.5 ? 'kk-ru' : 'ru-kk') : direction;
  const [from, to] = dir === 'kk-ru' ? ['kk', 'ru'] : ['ru', 'kk'];
  return { word, from, to, prompt: word[from], answer: word[to], transcription: word.tr };
}

// Distractors come from the same category first, so they stay plausible. Words whose prompt matches this
// question's prompt are skipped, since they would be a second correct answer.
function buildChoices(question, count) {
  const { word, from, to } = question;
  const seen = new Set([normalize(question.answer)]);
  const promptText = normalize(question.prompt);
  const sameCategory = shuffle(data.words.filter((w) => w.category === word.category));
  const otherCategories = shuffle(data.words.filter((w) => w.category !== word.category));
  const options = [question.answer];

  for (const candidate of [...sameCategory, ...otherCategories]) {
    if (options.length >= count) break;
    const text = normalize(candidate[to]);
    if (seen.has(text) || normalize(candidate[from]) === promptText) continue;
    seen.add(text);
    options.push(candidate[to]);
  }
  return shuffle(options);
}

function startSession(questions) {
  session = { questions, index: 0, correct: 0, missed: [], answered: false };
  setup.hidden = true;
  summary.hidden = true;
  play.hidden = false;
  showQuestion();
}

function startNewSession() {
  const pool = data.words.filter((w) => settings.categories.includes(w.category));
  const count = settings.questionCount === 'all' ? pool.length : Number(settings.questionCount);
  startSession(pickWords(pool, count).map((word) => makeQuestion(word, settings.direction)));
}

function showQuestion() {
  const question = session.questions[session.index];
  const total = session.questions.length;
  session.answered = false;

  $('progress-text').textContent = `${session.index + 1} / ${total}`;
  $('score-text').textContent = `${session.correct} correct`;
  $('progress-fill').style.width = `${(session.index / total) * 100}%`;
  $('task').textContent = `Translate into ${LANGUAGE_NAMES[question.to]}`;
  $('prompt').textContent = question.prompt;
  $('prompt').lang = question.from;
  $('prompt-tr').textContent = question.from === 'kk' && settings.showTranscription ? question.transcription : '';
  const promptSpeak = question.from === 'kk' ? speakButton(question.word) : null;
  $('prompt-speak').replaceChildren(...(promptSpeak ? [promptSpeak] : []));
  if (promptSpeak && settings.autoPlay) playWord(question.word, promptSpeak);
  $('feedback').hidden = true;
  $('next').hidden = true;

  if (settings.mode === 'choice') {
    $('typing').hidden = true;
    $('choices').hidden = false;
    $('choices').replaceChildren(
      ...buildChoices(question, Number(settings.options)).map((text, i) =>
        el(
          'button',
          { type: 'button', class: 'choice', lang: question.to, onclick: (e) => answerChoice(e.currentTarget, text) },
          el('kbd', {}, String(i + 1)),
          el('span', {}, text),
        ),
      ),
    );
  } else {
    $('choices').hidden = true;
    $('typing').hidden = false;
    $('kz-keys').hidden = question.to !== 'kk';
    answerInput.value = '';
    answerInput.className = '';
    answerInput.disabled = false;
    answerInput.lang = question.to;
    $('check').disabled = false;
    $('skip').disabled = false;
    answerInput.focus();
  }
}

function answerChoice(button, text) {
  if (session.answered) return;
  const question = session.questions[session.index];
  const correct = text === question.answer;
  for (const choice of $('choices').children) {
    choice.disabled = true;
    if (choice.querySelector('span').textContent === question.answer) choice.classList.add('correct');
  }
  if (!correct) button.classList.add('wrong');
  finishAnswer(correct ? 'correct' : 'wrong');
}

// Returns "correct", "almost" (right except for Kazakh-specific letters), "wrong", or "empty".
// Translations of other words with the same prompt also count: "младшая сестра" accepts both қарындас and сіңлі.
function checkTyped(input, question) {
  const typed = normalize(input);
  if (!typed) return 'empty';
  const promptText = normalize(question.prompt);
  const accepted = data.words
    .filter((w) => w === question.word || normalize(w[question.from]) === promptText)
    .flatMap((w) => acceptedAnswers(w[question.to]));
  if (accepted.includes(typed)) return 'correct';
  if (accepted.some((option) => fold(option) === fold(typed))) return 'almost';
  return 'wrong';
}

function answerTyped(skipped) {
  if (session.answered) return;
  const question = session.questions[session.index];
  const result = skipped ? 'wrong' : checkTyped(answerInput.value, question);
  if (result === 'empty') {
    answerInput.focus();
    return;
  }
  answerInput.classList.add(result);
  answerInput.disabled = true;
  $('check').disabled = true;
  $('skip').disabled = true;
  finishAnswer(result, skipped);
}

function finishAnswer(result, skipped = false) {
  const question = session.questions[session.index];
  const correct = result !== 'wrong';
  session.answered = true;
  if (correct) session.correct += 1;
  else session.missed.push(question);
  recordResult(question.word, correct);

  const headline = {
    correct: 'Correct.',
    almost: 'Almost. Counted as correct, but check the Kazakh letters:',
    wrong: skipped ? 'The answer is:' : 'Not quite. The answer is:',
  }[result];
  const feedback = $('feedback');
  feedback.className = `feedback ${result}`;
  feedback.replaceChildren(
    el(
      'p',
      {},
      headline,
      ' ',
      el('span', { class: 'answer', lang: question.to }, question.answer),
      question.to === 'kk' && question.transcription && ` ${question.transcription}`,
      question.to === 'kk' && speakButton(question.word),
    ),
    question.word.note && el('p', { class: 'small' }, question.word.note),
  );
  feedback.hidden = false;
  if (question.to === 'kk' && settings.autoPlay) playWord(question.word, feedback.querySelector('.speak'));

  $('score-text').textContent = `${session.correct} correct`;
  $('progress-fill').style.width = `${((session.index + 1) / session.questions.length) * 100}%`;
  $('next').hidden = false;
  $('next').focus();
}

function nextQuestion() {
  session.index += 1;
  if (session.index < session.questions.length) showQuestion();
  else showSummary();
}

function showSummary() {
  const answered = session.correct + session.missed.length;
  play.hidden = true;
  summary.hidden = false;

  $('final-score').textContent = `${session.correct} / ${answered}`;
  $('final-text').textContent = !answered
    ? 'No questions answered.'
    : session.missed.length
      ? `Words to review: ${session.missed.length}.`
      : 'No mistakes in this session.';
  $('missed').hidden = !session.missed.length;
  $('missed').replaceChildren(
    ...session.missed.map((q) =>
      el(
        'li',
        {},
        el(
          'span',
          { lang: q.from },
          q.from === 'kk' && speakButton(q.word),
          q.prompt,
          q.from === 'kk' && el('span', { class: 'tr' }, q.transcription),
        ),
        el('span', { class: 'arrow' }, '→'),
        el(
          'strong',
          { lang: q.to },
          q.to === 'kk' && speakButton(q.word),
          q.answer,
          q.to === 'kk' && el('span', { class: 'tr' }, q.transcription),
        ),
      ),
    ),
  );
  $('retry-missed').hidden = !session.missed.length;
  ($('retry-missed').hidden ? $('again') : $('retry-missed')).focus();
}

// ---- Wiring ----

function insertLetter(letter) {
  const { selectionStart: start, selectionEnd: end } = answerInput;
  answerInput.setRangeText(letter, start ?? answerInput.value.length, end ?? answerInput.value.length, 'end');
  answerInput.focus();
}

function wireEvents() {
  setup.addEventListener('change', updateSetupState);
  setup.addEventListener('submit', (event) => {
    event.preventDefault();
    settings = readSettings();
    storage.set(SETTINGS_KEY, settings);
    startNewSession();
  });

  $('select-all').addEventListener('click', () => {
    for (const input of setup.querySelectorAll('#category-picks input')) input.checked = true;
    updateSetupState();
  });
  $('select-none').addEventListener('click', () => {
    for (const input of setup.querySelectorAll('#category-picks input')) input.checked = false;
    updateSetupState();
  });
  $('reset-progress').addEventListener('click', () => {
    if (!confirm('Reset progress for all words? The quiz will stop favoring words you missed before.')) return;
    stats = {};
    storage.remove(STATS_KEY);
  });

  $('kz-keys').replaceChildren(
    ...KAZAKH_LETTERS.map((letter) =>
      el(
        'button',
        {
          type: 'button',
          lang: 'kk',
          // Keep focus (and the cursor position) in the answer field.
          onmousedown: (event) => event.preventDefault(),
          onclick: () => insertLetter(letter),
        },
        letter,
      ),
    ),
  );

  $('typing').addEventListener('submit', (event) => {
    event.preventDefault();
    answerTyped(false);
  });
  $('skip').addEventListener('click', () => answerTyped(true));
  $('next').addEventListener('click', nextQuestion);
  $('quit').addEventListener('click', showSummary);

  $('retry-missed').addEventListener('click', () =>
    startSession(shuffle(session.missed).map((q) => ({ ...q }))),
  );
  $('again').addEventListener('click', startNewSession);
  $('to-setup').addEventListener('click', () => {
    summary.hidden = true;
    setup.hidden = false;
  });

  // Number keys pick an option in multiple-choice mode.
  document.addEventListener('keydown', (event) => {
    if (play.hidden || session?.answered || settings.mode !== 'choice') return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const button = $('choices').children[Number(event.key) - 1];
    if (button) button.click();
  });
}

initThemeToggle($('theme-toggle'));

try {
  data = await loadWords();
  settings = loadSettings();
  renderSetup();
  wireEvents();
  setup.hidden = false;
} catch (error) {
  $('load-error').textContent = `${error.message} Run "node scripts/build.mjs" and reload.`;
  $('load-error').hidden = false;
}
