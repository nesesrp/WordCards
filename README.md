# WordCards

A flashcard app for learning vocabulary with spaced repetition. 

## Features

- **Home page:** the entry point to every way of practising: Kelime (Vocabulary), Yazma (Writing), Dinleme (Listening), Konuşma (Speaking), Okuma (Reading), Podcast and Oyun (Game)
- **Practice modes:** use your own cards, from all decks or one deck. *Writing:* see the Turkish meaning, type the English word. *Listening:* hear the word (browser speech synthesis, no audio files) and either pick its meaning or type what you heard (dictation). Dictation has slow replay, a hint and an "I don't know" button, accepts words that sound the same (e.g. *their* for *there*), and after a wrong answer marks the extra and missing letters. Both listening modes list the missed words at the end of a round. *Speaking:* see a word and say it out loud; the browser's speech recognition checks whether it was understood. It is lenient about extra words ("an apple") and words that sound the same, and gives three tries per word, with a button to hear the word first. Speech recognition works in Chrome, Edge and Safari (Chrome and Edge need an internet connection, because the audio is recognized on their servers). *Game:* match words with their meanings against the clock. Practice doesn't change the spaced repetition schedule but counts towards the daily streak
- **Reading:** 189 news texts, each in three versions (Kolay, Orta, Zor) with an estimated CEFR level. Tap a word to see its meaning from the word list (inflected forms like "went" or "cities" are found too) and add it to the "Okuma Kelimeleri" deck. Words already in your decks are underlined. The text can be read aloud sentence by sentence, and finished texts are marked as read. See [Reading texts](#reading-texts)
- **Podcast:** 10 short episodes (A1–B2) in which two hosts, Sam and Alex, talk about everyday topics. They are read aloud with two different browser voices, so there are no audio files. The transcript starts hidden; its words can be tapped like on the reading page and added to the "Podcast Kelimeleri" deck. Playback can go back or forward a sentence, start from any line and run at 0.75x, 1x or 1.25x. Each episode ends with comprehension questions. The episodes are written for this app and live in `frontend/data/podcasts.json`
- **Decks:** create, rename and delete decks (e.g. "English Verbs", "Spanish Food")
- **CEFR levels:** every deck can have a level (A1, A2, B1, B2, C1, C2). The home page can be filtered by level
- **Ready-made decks:** the "Hazır" page has about 9,800 English → Turkish words in 230+ decks, split by level, then by topic (e.g. "Yiyecek ve İçecek") or by part of speech ("Fiiller 1", "Fiiller 2"…). Pick your level and add a deck, or all decks of that level, with one click. See [Word lists](#word-lists)
- **Cards:** add, edit and delete cards with a word on the front and its meaning on the back
- **Study mode:** flip the card and answer "Bildim" (knew it) or "Bilemedim" (didn't know). Keyboard shortcuts: `Space` flips the card, `1` means "Bilemedim", `2` means "Bildim"
- **Spaced repetition:** uses the Leitner box system. A card you know comes back after 1, 3, 7, 16 and then 35 days. A card you miss goes back to the first box and shows up again later in the same session
- **Progress:** cards learned, daily streak, longest streak and activity for the last 14 days
- **Persistent data:** stored in the browser's `localStorage` for now
- **Backup:** the "İlerleme" page can download all decks, cards and progress as a JSON file and restore them from it (this replaces the current data). It reminds you if you haven't made a backup in 14 days

## Running the frontend

The frontend uses ES modules, so open it through a small local server instead of double-clicking the file:

```bash
cd frontend
python3 -m http.server 5173
# or: npx serve .
```

Then go to http://localhost:5173 in your browser.

## Project structure

```
frontend/
  index.html
  css/style.css
  js/app.js       # routing and views (UI)
  js/practice.js  # writing, listening, dictation, speaking and matching game modes
  js/speech.js    # English pronunciation and speech recognition (Web Speech API)
  js/reading.js   # reading page: texts, reading aloud
  js/podcast.js   # podcast page: episodes, player, questions
  js/wordsheet.js # tap a word to see its meaning and add it to a deck
  js/lemmas.js    # dictionary forms of inflected words ("went" → "go")
  js/homophones.js  # words that sound the same, accepted in dictation
  js/util.js      # shared helpers
  js/storage.js   # data layer (localStorage for now)
  js/srs.js       # spaced repetition algorithm
  js/stats.js     # streak and activity calculations
  js/presets.js   # CEFR levels; loads the ready-made decks
  data/wordlist.json  # ready-made decks (generated, see below)
  data/texts/         # reading texts (generated, see below)
  data/podcasts.json  # podcast episodes (hand-written)
scripts/
  build-wordlist.mjs  # builds frontend/data/wordlist.json
  build-texts.mjs     # builds frontend/data/texts/
  overrides.json      # hand-made translation fixes
```

## Word lists

`frontend/data/wordlist.json` is generated, so don't edit it by hand. To rebuild it:

```bash
node scripts/build-wordlist.mjs
```

The first run downloads the sources into `scripts/.cache/` (git-ignored). The largest one, the English Wiktionary extract (~520 MB), is only streamed and filtered, never stored in full. Later runs use the cache and take a few seconds.

How it works:

1. **Words and levels** come from the CEFR-J Vocabulary Profile (A1–B2) and the Octanove Vocabulary Profile (C1–C2).
2. **Turkish translations** come from two Wiktionary extracts: translation tables in the English Wiktionary and Turkish glosses of English words in the Turkish Wiktionary. A translation found in both ranks first. Rare or archaic Turkish words are dropped when a common one exists (checked against a Turkish frequency list), and a blocklist removes slang and slurs that appear as minor senses.
3. **Fixes:** `scripts/overrides.json` maps `"word|pos"` to a translation and always wins. Use it to correct a bad translation or to fill a missing one. An empty string drops the word. Words left without a translation are listed in `scripts/.cache/untranslated.txt` after each run.
4. **Decks:** words with a CEFR-J topic form topic decks; the rest are grouped by part of speech. Decks hold at most 50 words, most frequent words first (by an English frequency list).

### Sources and licenses

| Data | Source | License |
| ---- | ------ | ------- |
| A1–B2 words and levels | [CEFR-J Vocabulary Profile 1.5](https://github.com/openlanguageprofiles/olp-en-cefrj), Tono Laboratory, TUFS | Free for research and commercial use with citation |
| C1–C2 words and levels | [Octanove Vocabulary Profile C1/C2 1.0](https://github.com/openlanguageprofiles/olp-en-cefrj), Octanove Labs | CC BY-SA 4.0 |
| Turkish translations | [Wiktionary](https://www.wiktionary.org/) via [kaikki.org](https://kaikki.org/) (Wiktextract) | CC BY-SA 4.0 |
| Word frequencies | [FrequencyWords](https://github.com/hermitdave/FrequencyWords) (OpenSubtitles) | CC BY-SA 4.0 |

Because of the share-alike sources, `frontend/data/wordlist.json` is distributed under **CC BY-SA 4.0**. The rest of the code is not affected.

CEFR-J citation: The CEFR-J Wordlist Version 1.5. Compiled by Yukio Tono, Tokyo University of Foreign Studies. Retrieved from http://www.cefr-j.org/download.html. The app also credits the sources on the "Hazır" page.

## Roadmap: backend

**Stack:** Node.js + Express + SQLite

- **Node.js:** the backend uses the same language as the frontend (JavaScript), and the frontend's `srs.js` and `stats.js` can be reused on the server as they are.
- **Express:** a small, widely used web framework for building a REST API with little code.
- **SQLite:** a single-file database (via `better-sqlite3`), so there is no database server to install or run. If the app grows, it can be swapped for PostgreSQL later without changing the API.

Planned structure:

```
backend/
  package.json
  src/
    server.js       # Express app, serves the API and the frontend
    db.js           # SQLite connection and schema
    routes/
      decks.js
      cards.js
      stats.js
```

Planned API:

| Method | Endpoint                 | Description                          |
| ------ | ------------------------ | ------------------------------------ |
| GET    | `/api/decks`             | List decks                           |
| POST   | `/api/decks`             | Create a deck                        |
| PATCH  | `/api/decks/:id`         | Rename a deck or change its level    |
| DELETE | `/api/decks/:id`         | Delete a deck and its cards          |
| GET    | `/api/decks/:id/cards`   | List the cards in a deck             |
| POST   | `/api/decks/:id/cards`   | Add a card                           |
| PATCH  | `/api/cards/:id`         | Edit a card                          |
| DELETE | `/api/cards/:id`         | Delete a card                        |
| POST   | `/api/cards/:id/review`  | Save a study answer (`{ knew: true }`) |
| GET    | `/api/stats`             | Streak and activity data             |

**Frontend migration:** only `frontend/js/storage.js` needs to change. Its functions are already async, so their bodies will be replaced with `fetch('/api/...')` calls and the rest of the UI code stays as it is.

**Later:** user accounts (so each user has their own decks), and importing/exporting decks.

## Reading texts

`frontend/data/texts/` is generated from the [OneStopEnglish corpus](https://github.com/nishkalavallabhi/OneStopEnglishCorpus) (Vajjala & Lučić, 2018), which is licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The generated texts are under the same license. To rebuild them (run `build-wordlist.mjs` first, as its downloads are reused):

```bash
node scripts/build-texts.mjs
```

What the script does:

- **Cleans the text:** the source files are in Windows-1252 or Mac Roman, not UTF-8, and were copied from PDFs, so line breaks are joined and the lost ligatures are put back ("the  rst" → "the first", "dif cult" → "difficult") using the word lists as a dictionary
- **Estimates a CEFR level** for each version: the lowest level whose words make up 97% of the words that are in the CEFR-J / Octanove lists. Names and topic words that aren't in the lists are left out. The "easy" versions come out mostly B1, the "hard" ones mostly B2
- **Writes** `index.json` (titles, summaries, levels, word counts) and one file per text, so the reading page only loads what is being read

