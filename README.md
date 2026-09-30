# Learn Kazakh

My Kazakh–Russian vocabulary from lessons, plus a small site to search it and practice it. The word lists are plain
Markdown in [`words/`](words/) and the grammar notes are in [`rules/`](rules/). A GitHub Action turns them into a
dictionary, a quiz, and a rules page on GitHub Pages.

## Add words

Each file in `words/` is one category. The `# Heading` is the category name shown on the site:

```markdown
# Семья

| Қазақша | Транскрипция | Русский      | Заметка     |
| ------- | ------------ | ------------ | ----------- |
| ана     | [ɑˈnɑ]       | мать, мама   |             |
| іні     | [ɪˈnɪ]       | младший брат | для мужчины |
| бала    |              | ребёнок      |             |
```

- Columns are matched by header name, so their order doesn't matter. `Қазақша` and `Русский` are required;
  `Транскрипция`, `Заметка`, and `Правило` are optional, both as columns and per row.
- Use `Правило` to link a word to the rules it follows; see [Add rules](#add-rules).
- Write the transcription in any style you like. The starter words use approximate IPA with `ˈ` before the stressed
  syllable; check them with your teacher.
- Separate alternative translations with commas. In typing mode, any one of them counts as correct.
- Start a new category by adding a file. A numeric prefix such as `05-colors.md` sets the order and doesn't appear on
  the site.
- Write a literal `|` inside a cell as `\|`.

The build fails on a malformed row and prints the file and line number. It warns about a Kazakh word defined twice
but still builds.

## Add rules

Each file in `rules/` is one grammar rule. The `# Title` line names the rule, and the rest is ordinary Markdown: your
own explanation, links to other sites, or both. [`rules/01-plural.md`](rules/01-plural.md) is an example to copy.

```markdown
# Множественное число

Окончание зависит от последнего звука слова.

## Исключения

- ол → олар

## Ссылки

- [Kazakh grammar](https://en.wikipedia.org/wiki/Kazakh_grammar)
```

- The file name sets the rule ID: `01-plural.md` becomes `plural`. The numeric prefix only sets the order.
- `##` and `###` headings start sections. A section's ID is its heading in lowercase with spaces replaced by hyphens,
  so `## После числительных` becomes `после-числительных`.
- Supported syntax: paragraphs, bullet and numbered lists (not nested), tables, `>` quotes, fenced code blocks,
  `---` dividers, `**bold**`, `*italic*`, `` `code` ``, and links. Anything else shows as plain text.
- A link goes to another site (`https://…`), to another rule (`[падежи](cases)`), or to a section
  (`[исключения](plural#исключения)`, or `#исключения` within the same rule).

Link a word to rules in the `Правило` column of its table. Separate several rules with commas:

```markdown
| Қазақша | Русский | Правило           |
| ------- | ------- | ----------------- |
| олар    | они     | plural#исключения |
| сіздер  | вы      | plural, pronouns  |
```

The dictionary shows these links under the word, and each rule page lists the words that link to it. The build fails
on a link to a missing rule or section and prints the IDs you can use.

## Preview locally

Requires Node.js 20 or later. No `npm install` needed.

```sh
make serve
```

Open <http://localhost:8000>. The server rebuilds the word list and rules on every request, so edit a file and
reload. Run `make serve PORT=3000` to use another port.

Play buttons stay disabled until you generate the audio. This needs Python 3.10 or later and downloads the voice model
(about 130 MB) on the first run:

```sh
make audio
```

The first run creates a Python environment in `.venv/`. Run `make` to see the other targets, such as `make build` to
check the word tables and rule links, and `make clean` to delete the generated files.

## Pronunciation audio

`scripts/tts.py` generates an MP3 for every Kazakh word with [Piper](https://github.com/OHF-Voice/piper1-gpl), an
open-source text-to-speech engine. Piper runs inside the build, so the site plays static files and calls no
external service. The deploy workflow caches the voice model and the audio, so each push only generates files for
new or changed words.

Set the voice in `tts.json`:

- `voice`: a Piper voice name. The Kazakh voices are `kk_KZ-issai-high` (six speakers), `kk_KZ-iseke-x_low`, and
  `kk_KZ-raya-x_low`.
- `speaker`: the speaker number for multi-speaker voices, starting at 0.
- `lengthScale`: speaking speed. Values above `1.0` are slower, which can help with new words.

- `sha256`: checksums of the voice model files. The build stops if a downloaded model doesn't match them. After
  switching voices, run `tts.py` once: it prints the new checksums for you to compare with the ones on Hugging Face
  and add here.

Changing `tts.json` regenerates all audio on the next build. The audio is synthetic and can stress a word wrong;
trust your teacher over it. The Kazakh voices are trained on [ISSAI KazakhTTS](https://github.com/IS2AI/Kazakh_TTS)
(CC BY 4.0), which the site credits in its footer.

## Deploy

1. Push the repository to GitHub.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Push to `main`. The `Deploy site` workflow builds and publishes the site. Pull requests run the build as a
   check without deploying.

Before publishing, the workflow runs `scripts/stamp.mjs`, which adds the build version to every script and stylesheet
URL. Browsers cache GitHub Pages files for at least 10 minutes, and without the version a phone could run a cached
old page with new scripts. If a page and its scripts still come from different builds, the page reloads once. The
script rewrites `site/` in place, so don't run it locally.

## Security

The site is static, so there is no server to attack. The remaining risks are in the build and the browser:

- **GitHub Actions** are pinned to commit SHAs, and only the deploy job can write to GitHub Pages.
- **Python packages** are locked with hashes in `scripts/requirements.txt`, so pip rejects a tampered package. Edit
  `scripts/requirements.in` and regenerate the lock file with the command at the top of `requirements.txt`.
- **The voice model** is checked against the checksums in `tts.json`.
- **Dependabot** opens a monthly pull request to update the actions and Python packages.
- **Content-Security-Policy:** each page loads scripts, styles, data, and audio only from the site itself. It also
  enforces Trusted Types, which blocks HTML injection from scripts.

## Site features

- **Dictionary:** categories are cards that open in place, and the page remembers which ones you opened. Search
  covers both languages and notes, and it opens every category with a match. Search ignores case and `ё`, and it
  treats Kazakh letters like their Russian lookalikes, so `кыз` finds `қыз`. Press `/` to jump to the search box.
- **Quiz, pick mode:** choose the translation from 5–8 options. Keys `1`–`8` select an option.
- **Quiz, typing mode:** type the translation. An answer that differs only in Kazakh-specific letters counts as
  correct, and the page shows the right spelling. Buttons for `ә ғ қ ң ө ұ ү һ і` help without a Kazakh keyboard layout.
- **Progress:** the browser remembers which words you miss and shows them more often. Progress stays in that
  browser only.
- **Pronunciation:** a play button next to each Kazakh word. The quiz can also play Kazakh words automatically.
- **Transcription:** shown under Kazakh words in the dictionary, in quiz answers, and optionally with the question.
- **Theme:** light, dark, or following the system setting.

## Layout

```text
words/                        vocabulary, one Markdown file per category
scripts/build.mjs             words/*.md → site/data/words.json, with validation
scripts/serve.mjs             local preview server
scripts/stamp.mjs             adds the build version to asset URLs before deploy
scripts/tts.py                pronunciation audio with Piper, configured by tts.json
scripts/requirements.in       Python dependencies; requirements.txt is the hashed lock file
site/                         static site: HTML, CSS, and vanilla JavaScript
.github/workflows/pages.yml   build and deploy to GitHub Pages
Makefile                      shortcuts for the commands above; run `make` to list them
```
