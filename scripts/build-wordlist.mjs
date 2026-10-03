// Builds frontend/data/wordlist.json: English → Turkish word decks grouped by
// CEFR level.
//
//   node scripts/build-wordlist.mjs
//
// Sources (downloaded into scripts/.cache on the first run):
// - CEFR-J Vocabulary Profile 1.5 (A1–B2) and Octanove Vocabulary Profile
//   C1/C2 1.0: the words and their levels
// - Wiktionary, via kaikki.org extracts: Turkish translations. The English
//   Wiktionary gives translation tables, the Turkish Wiktionary gives Turkish
//   glosses for English words. A term found in both sources ranks first.
// - FrequencyWords (OpenSubtitles, English and Turkish 50k): orders words so
//   the most common ones come first in each deck, and drops rare or archaic
//   Turkish translations when a common one exists
//
// Manual fixes go in scripts/overrides.json ("word|pos": "çeviri"; an empty
// string drops the word). Words with no translation are listed in
// scripts/.cache/untranslated.txt.

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(ROOT, '.cache');
const OUT = path.join(ROOT, '..', 'frontend', 'data', 'wordlist.json');
const OVERRIDES = path.join(ROOT, 'overrides.json');

const SOURCES = {
  cefrj: 'https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/master/cefrj-vocabulary-profile-1.5.csv',
  octanove: 'https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/master/octanove-vocabulary-profile-c1c2-1.0.csv',
  freq: 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt',
  trFreq: 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/tr/tr_50k.txt',
  enWiktionary: 'https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl.gz',
  trWiktionary: 'https://kaikki.org/dictionary/downloads/tr/tr-extract.jsonl.gz',
};

const DECK_SIZE = 50;
const MIN_TOPIC_SIZE = 12;
const MAX_TERMS = 3;
const MAX_BACK_LENGTH = 40;

// CEFR-J part of speech → Wiktionary (wiktextract) part of speech.
const POS = {
  noun: 'noun', verb: 'verb', adjective: 'adj', adverb: 'adv', preposition: 'prep',
  pronoun: 'pron', determiner: 'det', conjunction: 'conj', number: 'num',
  interjection: 'intj', 'modal auxiliary': 'verb', 'be-verb': 'verb', 'do-verb': 'verb',
  'have-verb': 'verb', 'infinitive-to': 'particle', vern: 'verb',
};
const CONTENT_POS = new Set(['noun', 'verb', 'adj', 'adv']);

const POS_LABEL = {
  noun: 'isim', verb: 'fiil', adj: 'sıfat', adv: 'zarf', pron: 'zamir', det: 'belirleyici',
  prep: 'edat', conj: 'bağlaç', num: 'sayı', intj: 'ünlem', particle: 'mastar',
};
const POS_DECK = { noun: 'İsimler', verb: 'Fiiller', adj: 'Sıfatlar', adv: 'Zarflar' };
const OTHER_DECK = 'Diğer Kelimeler';

// CEFR-J topic labels → Turkish deck names. Unlisted labels are ignored.
const TOPICS = {
  'Daily life': 'Günlük Hayat',
  'Education': 'Eğitim',
  'Food and drink': 'Yiyecek ve İçecek',
  'Free time, entertainment': 'Boş Zaman ve Hobiler',
  'Hobbies and pastimes': 'Boş Zaman ve Hobiler',
  'Hobbies and lifestyles': 'Boş Zaman ve Hobiler',
  'Leisure activities': 'Boş Zaman ve Hobiler',
  'Health and body care': 'Sağlık ve Vücut',
  'House and home, environment': 'Ev ve Eşyalar',
  'Objects and rooms': 'Ev ve Eşyalar',
  'Language': 'Dil',
  'Personal identification': 'Kişisel Bilgiler',
  'Personal information': 'Kişisel Bilgiler',
  'Places': 'Şehir ve Mekânlar',
  'Things in the town, shops and shopping': 'Şehir ve Alışveriş',
  'Shopping': 'Şehir ve Alışveriş',
  'Relations with other people': 'Aile ve İlişkiler',
  'Family life': 'Aile ve İlişkiler',
  'Services': 'Hizmetler',
  'Travel': 'Seyahat ve Ulaşım',
  'Holidays': 'Seyahat ve Ulaşım',
  'Ways of travelling': 'Seyahat ve Ulaşım',
  'Ways of traveling': 'Seyahat ve Ulaşım',
  'Travel and services vocab': 'Seyahat ve Ulaşım',
  'Weather': 'Hava Durumu',
  'Adjectives: personality, description, feelings': 'Kişilik ve Duygular',
  'Arts': 'Sanat ve Medya',
  'Art': 'Sanat ve Medya',
  'Film': 'Sanat ve Medya',
  'Books and literature': 'Sanat ve Medya',
  'Media': 'Sanat ve Medya',
  'News, lifestyles and current affairs': 'Gündem ve Toplum',
  'Clothes': 'Giyim',
  'Colours': 'Renkler',
  'Dimensions': 'Ölçüler',
  'Nationalities and countries': 'Ülkeler ve Milliyetler',
  'Scientific development': 'Bilim ve Teknoloji',
  'Technical and legal language': 'Hukuk ve Teknik',
  'Work and Jobs': 'İş ve Meslekler',
  'Work and jobs': 'İş ve Meslekler',
};

// ---------------------------------------------------------------------------
// Downloads and parsing
// ---------------------------------------------------------------------------

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve(get(new URL(res.headers.location, url).href));
      } else if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`${url}: HTTP ${res.statusCode}`));
      } else {
        resolve(res);
      }
    }).on('error', reject);
  });
}

async function download(url, file) {
  const dest = path.join(CACHE, file);
  if (!fs.existsSync(dest)) {
    console.log(`Downloading ${url}`);
    const res = await get(url);
    await new Promise((resolve, reject) =>
      res.pipe(fs.createWriteStream(dest)).on('finish', resolve).on('error', reject));
  }
  return fs.readFileSync(dest, 'utf8');
}

// Streams a gzipped JSONL extract and keeps a small filtered copy in the cache,
// so the large file is only downloaded once.
async function filtered(url, file, pick) {
  const dest = path.join(CACHE, file);
  if (!fs.existsSync(dest)) {
    console.log(`Streaming ${url} (this can take a few minutes)`);
    const lines = readline.createInterface({ input: (await get(url)).pipe(zlib.createGunzip()) });
    const out = [];
    for await (const line of lines) {
      // Cheap pre-check before parsing: only entries for English words matter.
      if (!line.includes('"lang_code": "en"')) continue;
      const kept = pick(JSON.parse(line));
      if (kept) out.push(JSON.stringify(kept));
    }
    fs.writeFileSync(dest, out.join('\n'));
  }
  return fs.readFileSync(dest, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

function parseCsv(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const cells = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { cells.push(cell); cell = ''; }
      else cell += ch;
    }
    cells.push(cell);
    rows.push(cells);
  }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

// ---------------------------------------------------------------------------
// Translations
// ---------------------------------------------------------------------------

// Lowercases the first letter, but leaves abbreviations like "DVD" alone.
const lowerFirst = (s) =>
  /^.\p{Lu}/u.test(s) ? s : s.charAt(0).toLocaleLowerCase('tr') + s.slice(1);

// Vulgar words and slurs that show up as slang senses in Wiktionary.
const BLOCKED = new Set([
  'ibne', 'homo', 'penis', 'kancık', 'zenci', 'aynasız', 'orospu', 'kahpe', 'piç', 'puşt',
  'sik', 'sikmek', 'siktir', 'yarak', 'yarrak', 'amcık', 'göt', 'götveren', 'pezevenk',
  'kaltak', 'sürtük', 'top', 'gavat', 'ibnelik', 'dönme', 'kevaşe',
]);

// Turns a gloss or translation into short Turkish terms, dropping anything that
// reads like a definition rather than a translation.
function terms(text) {
  return String(text)
    .replace(/\([^)]*\)|\[[^\]]*\]/g, '')
    .split(/[,;]/)
    .map((t) => lowerFirst(t.replace(/^[\s:'"“”]+|[\s.:'"“”]+$/g, '')))
    .filter((t) => t && t.length <= 30 && t.split(/\s+/).length <= 3 && !/[0-9=!?"“”…]/.test(t)
      // Turkish has no q, w or x, so these are English fragments.
      && !/[qwx]/i.test(t) && !/\b(the|of|and|which|who)\b/i.test(t)
      && !t.split(/\s+/).some((w) => BLOCKED.has(w.toLocaleLowerCase('tr'))));
}

// Candidate terms by "word|pos". Keys keep their case so that e.g. "March"
// (the month) and "march" stay apart; `lookup` falls back to any case.
function candidates(rows, termsOf) {
  const exact = new Map();
  const anyCase = new Map();
  for (const d of rows) {
    const list = termsOf(d);
    if (!list.length) continue;
    for (const [map, key] of [[exact, `${d.word}|${d.pos}`], [anyCase, `${d.word.toLowerCase()}|${d.pos}`]]) {
      map.set(key, [...(map.get(key) ?? []), ...list]);
    }
  }
  return {
    lookup: (word, pos) => exact.get(`${word}|${pos}`) ?? anyCase.get(`${word.toLowerCase()}|${pos}`) ?? [],
    // Every part of speech, for function words that sources tag differently.
    lookupAnyPos: (word) => [...anyCase].filter(([k]) => k.startsWith(`${word.toLowerCase()}|`)).flatMap(([, v]) => v),
  };
}

// Picks up to MAX_TERMS terms. Terms found in both sources rank first, then
// terms listed for more senses, then the English Wiktionary order (its
// translation tables follow the sense order).
function chooseTranslation(en = [], tr = []) {
  let all = [...new Set([...en, ...tr])];
  const common = all.filter(isCommonTurkish);
  if (common.length) all = common;
  const count = (list, t) => list.filter((x) => x === t).length;
  const score = (t) => {
    const e = en.indexOf(t);
    const r = tr.indexOf(t);
    return [
      e !== -1 && r !== -1 ? 0 : 1,
      -(count(en, t) + count(tr, t)),
      e !== -1 ? e : 1000 + r,
    ];
  };
  const compare = (a, b) => {
    const [sa, sb] = [score(a), score(b)];
    return sa[0] - sb[0] || sa[1] - sb[1] || sa[2] - sb[2];
  };
  const chosen = [];
  for (const t of all.sort(compare)) {
    const next = [...chosen, t].join(', ');
    if (chosen.length && (chosen.length >= MAX_TERMS || next.length > MAX_BACK_LENGTH)) break;
    chosen.push(t);
  }
  return chosen.join(', ');
}

// ---------------------------------------------------------------------------
// Decks
// ---------------------------------------------------------------------------

function slug(s) {
  const map = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
  return s.toLocaleLowerCase('tr').replace(/[çğıöşüâîû]/g, (c) => map[c])
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Splits a list into nearly equal chunks of at most `size` items.
function chunk(list, size) {
  const n = Math.ceil(list.length / size);
  const per = Math.ceil(list.length / n);
  return Array.from({ length: n }, (_, i) => list.slice(i * per, (i + 1) * per));
}

function buildDecks(level, entries, frequency) {
  const rank = (e) => Math.min(...e.variants.map((v) => frequency.get(v.toLowerCase()) ?? 1e6));
  const byFrequency = (a, b) => rank(a) - rank(b) || a.word.localeCompare(b.word);

  // A headword with several parts of speech in one level gets a label on the front.
  const counts = new Map();
  entries.forEach((e) => counts.set(e.word, (counts.get(e.word) ?? 0) + 1));
  const card = (e) => [
    e.variants.join(' / ') + (counts.get(e.word) > 1 && POS_LABEL[e.pos] ? ` (${POS_LABEL[e.pos]})` : ''),
    e.back,
  ];

  const topics = new Map();
  for (const e of entries) if (e.topic) topics.set(e.topic, [...(topics.get(e.topic) ?? []), e]);
  const groups = [];
  const rest = [];
  for (const [name, list] of topics) {
    if (list.length >= MIN_TOPIC_SIZE) groups.push({ name, list });
    else rest.push(...list);
  }
  groups.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  rest.push(...entries.filter((e) => !e.topic));

  const byPos = new Map();
  for (const e of rest) {
    const name = POS_DECK[e.pos] ?? OTHER_DECK;
    byPos.set(name, [...(byPos.get(name) ?? []), e]);
  }
  for (const name of [...Object.values(POS_DECK), OTHER_DECK]) {
    const list = byPos.get(name);
    if (!list) continue;
    // A handful of leftover words joins the previous deck instead of forming its own.
    if (list.length < MIN_TOPIC_SIZE && groups.length) groups.at(-1).list.push(...list);
    else groups.push({ name, list });
  }

  const posDecks = new Set([...Object.values(POS_DECK), OTHER_DECK]);
  return groups.flatMap(({ name, list }) => {
    const parts = chunk(list.sort(byFrequency), DECK_SIZE);
    return parts.map((part, i) => ({
      id: `cefr-${level.toLowerCase()}-${slug(name)}${parts.length > 1 ? `-${i + 1}` : ''}`,
      level,
      kind: posDecks.has(name) ? 'pos' : 'topic',
      name: parts.length > 1 ? `${name} ${i + 1}` : name,
      words: part.map(card),
    }));
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

fs.mkdirSync(CACHE, { recursive: true });

const rows = [
  ...parseCsv(await download(SOURCES.cefrj, 'cefrj.csv')),
  ...parseCsv(await download(SOURCES.octanove, 'octanove.csv')),
];
const frequency = new Map(
  (await download(SOURCES.freq, 'en_50k.txt')).split('\n').map((l, i) => [l.split(' ')[0], i]));

const turkishWords = new Set(
  (await download(SOURCES.trFreq, 'tr_50k.txt')).split('\n').map((l) => l.split(' ')[0]));
// Suffixes like "-ebilmek" are kept; otherwise every word must be in the list.
function isCommonTurkish(term) {
  return term.startsWith('-')
    || term.split(/[\s-]+/).every((w) => turkishWords.has(w.toLocaleLowerCase('tr')));
}

const entries = [];
const seen = new Set();
for (const r of rows) {
  const variants = [...new Map(r.headword.split('/').map((v) => [v.trim().toLowerCase(), v.trim()])).values()]
    .filter(Boolean).slice(0, 2);
  const pos = POS[r.pos];
  const key = `${variants[0]?.toLowerCase()}|${pos}`;
  if (!variants.length || !pos || !/^(A1|A2|B1|B2|C1|C2)$/.test(r.CEFR) || seen.has(key)) continue;
  seen.add(key);
  const topic = [r['CoreInventory 1'], r['CoreInventory 2'], r.Threshold].map((t) => TOPICS[t]).find(Boolean);
  entries.push({ word: variants[0], variants, pos, level: r.CEFR, topic });
}
const wanted = new Set(entries.flatMap((e) => e.variants.map((v) => v.toLowerCase())));

const enRows = await filtered(SOURCES.enWiktionary, 'en-wiktionary-tr.jsonl', (d) => {
  if (d.lang_code !== 'en' || !wanted.has(d.word.toLowerCase())) return null;
  const tr = [
    ...(d.translations ?? []),
    ...(d.senses ?? []).flatMap((s) => s.translations ?? []),
  ].filter((t) => t.lang_code === 'tr' && t.word).map((t) => t.word);
  return tr.length ? { word: d.word, pos: d.pos, tr } : null;
});
const trRows = await filtered(SOURCES.trWiktionary, 'tr-wiktionary-en.jsonl', (d) => {
  if (d.lang_code !== 'en' || !wanted.has(d.word.toLowerCase())) return null;
  const glosses = (d.senses ?? []).map((s) => s.glosses?.[0]).filter(Boolean);
  return glosses.length ? { word: d.word, pos: d.pos, glosses } : null;
});

const en = candidates(enRows, (d) => d.tr.flatMap(terms));
const tr = candidates(trRows, (d) => d.glosses.flatMap(terms));

// Many "-ly" adverbs have no translation of their own; build one from the
// adjective: "angrily" → "kızgın bir şekilde".
function adverbFromAdjective(word) {
  if (!/ly$/.test(word)) return '';
  const stem = word.slice(0, -2);
  const bases = [stem, `${stem.slice(0, -1)}y`, `${word.slice(0, -1)}e`, word.slice(0, -4), stem.replace(/l$/, '')];
  for (const base of bases) {
    const [first] = chooseTranslation(en.lookup(base, 'adj'), tr.lookup(base, 'adj')).split(', ');
    if (first) return `${first} bir şekilde`;
  }
  return '';
}

const overrides = fs.existsSync(OVERRIDES) ? JSON.parse(fs.readFileSync(OVERRIDES, 'utf8')) : {};
const entryKeys = new Set(entries.map((e) => `${e.word}|${e.pos}`));
for (const key of Object.keys(overrides)) {
  if (!entryKeys.has(key)) console.warn(`overrides.json: no word matches "${key}"`);
}
const untranslated = [];

for (const e of entries) {
  const override = overrides[`${e.word}|${e.pos}`];
  if (override !== undefined) {
    e.back = override;
    continue;
  }
  let enTerms = e.variants.flatMap((v) => en.lookup(v, e.pos));
  let trTerms = e.variants.flatMap((v) => tr.lookup(v, e.pos));
  // Function words are tagged inconsistently across sources, so ignore the
  // part of speech for them.
  if (!enTerms.length && !trTerms.length && !CONTENT_POS.has(e.pos)) {
    enTerms = e.variants.flatMap((v) => en.lookupAnyPos(v));
    trTerms = e.variants.flatMap((v) => tr.lookupAnyPos(v));
  }
  e.back = chooseTranslation(enTerms, trTerms) || adverbFromAdjective(e.word);
  if (!e.back) untranslated.push(`${e.level}\t${e.word}|${e.pos}`);
}

const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const decks = levels.flatMap((level) =>
  buildDecks(level, entries.filter((e) => e.level === level && e.back), frequency));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ decks }));
fs.writeFileSync(path.join(CACHE, 'untranslated.txt'), untranslated.join('\n') + '\n');

for (const level of levels) {
  const total = entries.filter((e) => e.level === level).length;
  const ds = decks.filter((d) => d.level === level);
  const words = ds.reduce((n, d) => n + d.words.length, 0);
  console.log(`${level}: ${words}/${total} words in ${ds.length} decks`);
}
console.log(`Wrote ${path.relative(process.cwd(), OUT)}; untranslated list in ${path.relative(process.cwd(), CACHE)}/untranslated.txt`);
