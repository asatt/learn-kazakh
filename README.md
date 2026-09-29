# Learn Kazakh

My Kazakh–Russian vocabulary from lessons, plus a small site to search it and practice it. The word lists are plain
Markdown in [`words/`](words/). A GitHub Action turns them into a dictionary and quiz on GitHub Pages.

## Add words

Each file in `words/` is one category. The `# Heading` is the category name shown on the site:

```markdown
# Семья

| Қазақша | Транскрипция | Русский      | Заметка   |
| ------- | ------------ | ------------ | --------- |
| ана     | [ɑˈnɑ]       | мать, мама   |           |
| іні     | [ɪˈnɪ]       | младший брат | for a man |
| бала    |              | ребёнок      |           |
```

- Columns are matched by header name, so their order doesn't matter. `Қазақша` and `Русский` are required;
  `Транскрипция` and `Заметка` are optional, both as columns and per row.
- Write the transcription in any style you like. The starter words use approximate IPA with `ˈ` before the stressed
  syllable; check them with your teacher.
- Separate alternative translations with commas. In typing mode, any one of them counts as correct.
- Start a new category by adding a file. A numeric prefix such as `05-colors.md` sets the order and doesn't appear on
  the site.
- Write a literal `|` inside a cell as `\|`.

The build fails on a malformed row and prints the file and line number. It warns about a Kazakh word defined twice
but still builds.

## Preview locally

Requires Node.js 20 or later. No `npm install` needed.

```sh
node scripts/serve.mjs
```

Open <http://localhost:8000>. The server rebuilds the word list on every request, so edit a file and reload.

## Deploy

1. Push the repository to GitHub.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Push to `main`. The `Deploy site` workflow builds and publishes the site. Pull requests run the build as a
   check without deploying.

## Site features

- **Dictionary:** search both languages and notes as you type, and filter by category. Search ignores case and `ё`,
  and it treats Kazakh letters like their Russian lookalikes, so `кыз` finds `қыз`. Press `/` to jump to the search box.
- **Quiz, pick mode:** choose the translation from 5–8 options. Keys `1`–`8` select an option.
- **Quiz, typing mode:** type the translation. An answer that differs only in Kazakh-specific letters counts as
  correct, and the page shows the right spelling. Buttons for `ә ғ қ ң ө ұ ү һ і` help without a Kazakh keyboard layout.
- **Progress:** the browser remembers which words you miss and shows them more often. Progress stays in that
  browser only.
- **Transcription:** shown under Kazakh words in the dictionary, in quiz answers, and optionally with the question.
- **Theme:** light, dark, or following the system setting.

## Layout

```text
words/                        vocabulary, one Markdown file per category
scripts/build.mjs             words/*.md → site/data/words.json, with validation
scripts/serve.mjs             local preview server
site/                         static site: HTML, CSS, and vanilla JavaScript
.github/workflows/pages.yml   build and deploy to GitHub Pages
```
