// Builds the reading texts in frontend/data/texts/: index.json (the list) and
// one <id>.json per text, so the reading page only loads the text being read.
//
//   node scripts/build-texts.mjs
//
// Source: the OneStopEnglish corpus (Vajjala & Lučić, 2018), CC BY-SA 4.0:
// 189 news articles, each rewritten at three reading levels (elementary,
// intermediate, advanced). https://github.com/nishkalavallabhi/OneStopEnglishCorpus
//
// Each version gets a CEFR level from the CEFR-J / Octanove word lists that
// build-wordlist.mjs downloads (run that first): the lowest level whose words
// cover enough of the text.

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import { lemmas } from '../frontend/js/lemmas.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(ROOT, '.cache');
const CORPUS = path.join(CACHE, 'onestop');
const OUT = path.join(ROOT, '..', 'frontend', 'data', 'texts');

const REPO = 'nishkalavallabhi/OneStopEnglishCorpus';
const FOLDER = 'Texts-Together-OneCSVperFile';
const VERSIONS = { Elementary: 'ele', Intermediate: 'int', Advanced: 'adv' };
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
// Share of words a reader must know to read a text without too much help.
const COVERAGE = 0.97;

// ---------------------------------------------------------------------------
// Downloads and parsing
// ---------------------------------------------------------------------------

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'wordcards-build' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve(get(new URL(res.headers.location, url).href));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => (res.statusCode === 200
        ? resolve(Buffer.concat(chunks))
        : reject(new Error(`${url}: HTTP ${res.statusCode}`))));
    }).on('error', reject);
  });
}

async function downloadCorpus() {
  fs.mkdirSync(CORPUS, { recursive: true });
  let files = fs.readdirSync(CORPUS).filter((f) => f.endsWith('.csv'));
  if (files.length) return files;
  console.log(`Downloading ${REPO}`);
  const list = JSON.parse(await get(`https://api.github.com/repos/${REPO}/contents/${FOLDER}`));
  for (const { name, download_url: url } of list) {
    fs.writeFileSync(path.join(CORPUS, name), await get(url));
  }
  files = list.map((f) => f.name);
  return files;
}

// Windows-1252 bytes 0x80–0x9F (Node decodes 'windows-1252' as Latin-1, which
// turns these into control characters).
const CP1252 = '€\x81‚ƒ„…†‡ˆ‰Š‹Œ\x8dŽ\x8f\x90‘’“”•–—˜™š›œ\x9džŸ';

// The files are in two old encodings: Windows-1252 (curly quotes are bytes
// 0x91–0x94) or Mac Roman (0xD2–0xD5). None of them is UTF-8. A few files
// also use the control character 0x19 as an apostrophe.
function decode(bytes) {
  const windows = bytes.some((b) => b >= 0x91 && b <= 0x97);
  const mac = !windows && bytes.some((b) => b >= 0xd0 && b <= 0xd5);
  const text = mac
    ? new TextDecoder('macintosh').decode(bytes)
    : Array.from(bytes, (b) => (b >= 0x80 && b < 0xa0 ? CP1252[b - 0x80] : String.fromCharCode(b))).join('');
  return text.replace(/\x19/g, '’').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
}

// When the texts were copied out of PDFs, the ligatures fi, fl, ff, ffi and
// ffl became spaces: "the  rst" (first), "dif cult" (difficult), "e ect"
// (effect). They are put back where that turns the pieces into a known word.
const LIGATURES = ['fi', 'fl', 'ff', 'ffi', 'ffl'];

// `listed`: is a piece a real word (CEFR list)? `rank`: frequency rank of a
// repaired word. The frequency list is only used for the repaired words, as it
// also has fragments like "rst" (from typos in subtitles).
function fixLigatures(text, listed, rank) {
  const known = (w) => (w.length > 1 || /^[ai]$/i.test(w)) && listed(w);
  // The most common real word among the candidates.
  const best = (candidates) => candidates
    .filter((w) => rank(w) !== undefined)
    .sort((x, y) => rank(x) - rank(y))[0];
  const parts = text.split(/([A-Za-z]+)/); // words at odd indices
  for (let i = 1; i + 2 < parts.length; i += 2) {
    const [a, gap, b] = parts.slice(i, i + 3);
    // A space where none belongs: two in a row, or one after an opening quote.
    const extraSpace = /\s{2,}$|[‘“"(]\s$/.test(gap);
    let fix;
    if (gap === ' ' || gap === '\n') {
      // Inside a word: "dif cult" → "difficult". Sometimes the ligature
      // survived but a space came after it: "fi ght" → "fight".
      if (!/^[a-z]/.test(b) || (known(a) && known(b))) continue;
      const joins = /(fi|fl|ff)$/i.test(a) ? ['', ...LIGATURES] : LIGATURES;
      fix = best(joins.map((l) => a + l + b));
      if (fix) {
        parts.splice(i, 3, fix);
        i -= 2;
      }
    } else if (extraSpace && /^[a-z]/.test(b) && !known(b) && (fix = best(LIGATURES.map((l) => l + b)))) {
      // At the start of a word: "the  rst" → "the first".
      const kept = gap.trimEnd(); // keep punctuation, then one space unless after a quote
      parts.splice(i + 1, 2, /[‘“"(]$/.test(kept) ? kept : `${kept} `, fix);
    } else if (/^\s{2,}$/.test(gap) && !known(a) && (fix = best(LIGATURES.map((l) => a + l)))) {
      // At the end of a word: "sta  and" → "staff and".
      parts.splice(i, 2, fix, ' ');
    }
  }
  return parts.join('');
}

// CSV with quoted cells that may span several lines.
function parseCsv(text) {
  const rows = [[]];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { rows.at(-1).push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      rows.at(-1).push(cell);
      cell = '';
      rows.push([]);
    } else cell += ch;
  }
  rows.at(-1).push(cell);
  return rows.filter((r) => r.some((c) => c.trim()));
}

// Joins the line breaks left over from the PDFs into one paragraph. A line
// that ends in a hyphen is part of a compound ("mid-\n2030s"), so no space.
const cleanParagraph = (s, listed, rank) => fixLigatures(s, listed, rank)
  .replace(/-\s*\n\s*/g, '-')
  .replace(/\s*\n\s*/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

// Word → frequency rank (0 = most common), from the subtitle frequency list
// that build-wordlist.mjs downloads.
function readFrequency() {
  const ranks = new Map();
  fs.readFileSync(path.join(CACHE, 'en_50k.txt'), 'utf8').split('\n').forEach((line, i) => {
    const word = line.split(' ')[0];
    if (word && !ranks.has(word)) ranks.set(word, i);
  });
  return (w) => ranks.get(w.toLowerCase());
}

function readWordLevels() {
  const levels = new Map();
  for (const file of ['cefrj.csv', 'octanove.csv']) {
    const csv = path.join(CACHE, file);
    if (!fs.existsSync(csv)) throw new Error(`${csv} is missing: run node scripts/build-wordlist.mjs first`);
    const [head, ...rows] = parseCsv(fs.readFileSync(csv, 'utf8'));
    const word = head.indexOf('headword');
    const cefr = head.indexOf('CEFR');
    for (const r of rows) {
      const level = LEVELS.indexOf(r[cefr]?.trim());
      if (level < 0) continue;
      for (const w of r[word].split('/')) {
        const key = w.trim().toLowerCase();
        if (key && !(levels.get(key) <= level)) levels.set(key, level);
      }
    }
  }
  return levels;
}

const WORD = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;

// The CEFR level of a text: the lowest level whose words cover COVERAGE of it.
// Only words in the CEFR lists count. Names, numbers and topic words that
// aren't in the lists (e.g. "bacteria") would push every text to C2, and the
// reading page explains them anyway.
function textLevel(paragraphs, wordLevels) {
  const counts = new Array(LEVELS.length).fill(0);
  let total = 0;
  for (const p of paragraphs) {
    for (const m of p.matchAll(WORD)) {
      const found = lemmas(m[0]).map((l) => wordLevels.get(l)).filter((l) => l !== undefined);
      if (!found.length) continue;
      counts[Math.min(...found)]++;
      total++;
    }
  }
  let covered = 0;
  for (let l = 0; l < LEVELS.length; l++) {
    covered += counts[l];
    if (covered / total >= COVERAGE) return LEVELS[l];
  }
  return LEVELS.at(-1);
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// Cuts `s` at a word boundary so it fits in `max` characters.
const shorten = (s, max) => (s.length <= max ? s : `${s.slice(0, s.lastIndexOf(' ', max - 1))}…`);
const wordCount = (paragraphs) => paragraphs.reduce((n, p) => n + (p.match(WORD)?.length ?? 0), 0);

async function main() {
  const files = await downloadCorpus();
  const wordLevels = readWordLevels();
  const rank = readFrequency();
  const listed = (w) => lemmas(w).some((l) => wordLevels.has(l));
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const index = [];
  for (const file of files.sort()) {
    const [head, ...rows] = parseCsv(decode(fs.readFileSync(path.join(CORPUS, file))));
    const id = slug(file.replace(/\.csv$/, ''));
    const versions = {};
    head.forEach((name, col) => {
      const key = VERSIONS[name.trim()];
      if (!key) return;
      const paragraphs = rows.map((r) => cleanParagraph(r[col] ?? '', listed, rank)).filter(Boolean);
      if (paragraphs.length) versions[key] = { level: textLevel(paragraphs, wordLevels), paragraphs };
    });
    if (Object.keys(versions).length !== 3) {
      console.warn(`Skipped ${file}: not all three versions`);
      continue;
    }
    const title = file.replace(/\.csv$/, '').replace(/^WNL /, '');
    fs.writeFileSync(path.join(OUT, `${id}.json`), JSON.stringify({ id, title, versions }));
    index.push({
      id,
      title,
      summary: shorten(versions.ele.paragraphs[0], 160),
      versions: Object.fromEntries(Object.entries(versions).map(([k, v]) =>
        [k, { level: v.level, words: wordCount(v.paragraphs) }])),
    });
  }

  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({
    source: {
      name: 'OneStopEnglish corpus (Vajjala & Lučić, 2018)',
      url: `https://github.com/${REPO}`,
      license: 'CC BY-SA 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      changes: 'Text encoding and PDF ligatures repaired; CEFR level estimates added.',
    },
    texts: index,
  }));

  const byLevel = {};
  for (const t of index) {
    for (const [k, v] of Object.entries(t.versions)) {
      byLevel[k] ??= {};
      byLevel[k][v.level] = (byLevel[k][v.level] || 0) + 1;
    }
  }
  console.log(`Wrote ${index.length} texts to ${path.relative(process.cwd(), OUT)}`);
  for (const [k, levels] of Object.entries(byLevel)) console.log(`  ${k}:`, levels);
}

main();
