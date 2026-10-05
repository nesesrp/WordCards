// Data layer. For now everything lives in the browser's localStorage.
// When the backend is added, only the bodies of the functions in this file will
// be replaced with fetch() calls. That's why they are all async, and no UI code
// outside this file touches localStorage.

import { newCardFields } from './srs.js';
import { dateKey } from './stats.js';

const KEY = 'wordcards:v1';

const emptyState = () => ({ decks: [], cards: [], activity: {}, settings: {} });

// Ready-made cards used to get Turkish part-of-speech labels on the English
// front, e.g. "like (fiil)". They are renamed once to English ("like (verb)").
const OLD_POS_LABELS = {
  isim: 'noun', fiil: 'verb', sıfat: 'adjective', zarf: 'adverb', zamir: 'pronoun',
  belirleyici: 'determiner', edat: 'preposition', bağlaç: 'conjunction', sayı: 'number',
  ünlem: 'interjection', mastar: 'particle',
};
const OLD_POS_LABEL = new RegExp(` \\((${Object.keys(OLD_POS_LABELS).join('|')})\\)$`);

function migrate(state) {
  if (state.settings.posLabelsEn) return state;
  for (const card of state.cards) {
    card.front = card.front.replace(OLD_POS_LABEL, (_, label) => ` (${OLD_POS_LABELS[label]})`);
  }
  state.settings.posLabelsEn = true;
  write(state);
  return state;
}

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? migrate({ ...emptyState(), ...JSON.parse(raw) }) : emptyState();
  } catch {
    return emptyState();
  }
}

function write(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

const uid = () =>
  crypto.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2);

// --- Decks ---

export async function getDecks() {
  return read().decks.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getDeck(id) {
  return read().decks.find((d) => d.id === id) ?? null;
}

export async function createDeck(name, level = null) {
  const state = read();
  const deck = { id: uid(), name, level, createdAt: Date.now() };
  state.decks.push(deck);
  write(state);
  return deck;
}

// fields: { name?, level? }
export async function updateDeck(id, fields) {
  const state = read();
  const deck = state.decks.find((d) => d.id === id);
  if (deck) Object.assign(deck, fields);
  write(state);
  return deck;
}

// Copies ready-made decks (see presets.js) into the user's decks with fresh
// cards. Takes a list so that adding a whole level is a single write.
export async function importPresets(presets) {
  const state = read();
  const now = Date.now();
  const decks = presets.map((preset) => {
    const deck = {
      id: uid(), name: preset.name, level: preset.level, presetId: preset.id, createdAt: now,
    };
    state.decks.push(deck);
    // Cards are listed newest first, so count down to keep the preset's order.
    preset.words.forEach(([front, back], i) => {
      state.cards.push({
        id: uid(), deckId: deck.id, front, back, createdAt: now - i, ...newCardFields(now),
      });
    });
    return deck;
  });
  write(state);
  return decks;
}

// --- Cards ---

export async function getAllCards() {
  return read().cards;
}

export async function getCards(deckId) {
  return read()
    .cards.filter((c) => c.deckId === deckId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function createCard(deckId, front, back) {
  const state = read();
  const now = Date.now();
  const card = { id: uid(), deckId, front, back, createdAt: now, ...newCardFields(now) };
  state.cards.push(card);
  write(state);
  return card;
}

export async function updateCard(id, fields) {
  const state = read();
  const card = state.cards.find((c) => c.id === id);
  if (card) Object.assign(card, fields);
  write(state);
  return card;
}

export async function deleteCard(id) {
  const state = read();
  state.cards = state.cards.filter((c) => c.id !== id);
  write(state);
}

// Saves a study answer and increments today's activity count.
export async function saveReview(card) {
  const state = read();
  const i = state.cards.findIndex((c) => c.id === card.id);
  if (i !== -1) state.cards[i] = card;
  const today = dateKey();
  state.activity[today] = (state.activity[today] || 0) + 1;
  write(state);
}

// --- Settings ---

export async function getSettings() {
  return read().settings;
}

export async function saveSettings(fields) {
  const state = read();
  state.settings = { ...state.settings, ...fields };
  write(state);
  return state.settings;
}

// --- Stats ---

// Counts practice answers (writing, listening, game) towards today's activity.
export async function logActivity(count = 1) {
  const state = read();
  const today = dateKey();
  state.activity[today] = (state.activity[today] || 0) + count;
  write(state);
}

export async function getActivity() {
  return read().activity;
}

// --- Backup ---

const BACKUP_APP = 'wordcards';

// Everything the user has, as a plain object to save to a file.
export async function exportBackup() {
  const state = read();
  state.settings.lastBackup = Date.now();
  write(state);
  return { app: BACKUP_APP, version: 1, exportedAt: new Date().toISOString(), data: state };
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isText = (v) => typeof v === 'string';

// Replaces all data with a backup made by exportBackup(). Throws an Error with a
// Turkish message (shown to the user) if the file isn't a valid backup.
export async function importBackup(backup) {
  const data = backup?.app === BACKUP_APP ? backup.data : null;
  const valid = isObject(data)
    && Array.isArray(data.decks) && data.decks.every((d) => isObject(d) && isText(d.id) && isText(d.name))
    && Array.isArray(data.cards) && data.cards.every((c) =>
      isObject(c) && isText(c.id) && isText(c.deckId) && isText(c.front) && isText(c.back))
    && (data.activity === undefined || isObject(data.activity))
    && (data.settings === undefined || isObject(data.settings));
  if (!valid) throw new Error('Bu dosya bir WordCards yedeği değil ya da bozuk.');
  if (backup.version > 1) throw new Error('Bu yedek uygulamanın daha yeni bir sürümüyle alınmış.');
  // Older backups may still have Turkish part-of-speech labels.
  write(migrate({ ...emptyState(), ...data }));
  return { decks: data.decks.length, cards: data.cards.length };
}

