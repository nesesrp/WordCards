// Data layer. For now everything lives in the browser's localStorage.
// When the backend is added, only the bodies of the functions in this file will
// be replaced with fetch() calls. That's why they are all async, and no UI code
// outside this file touches localStorage.

import { newCardFields } from './srs.js';
import { dateKey } from './stats.js';

const KEY = 'wordcards:v1';

const emptyState = () => ({ decks: [], cards: [], activity: {}, settings: {} });

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...emptyState(), ...JSON.parse(raw) } : emptyState();
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

export async function getActivity() {
  return read().activity;
}
