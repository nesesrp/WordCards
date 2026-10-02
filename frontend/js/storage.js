// Data layer. For now everything lives in the browser's localStorage.
// When the backend is added, only the bodies of the functions in this file will
// be replaced with fetch() calls. That's why they are all async, and no UI code
// outside this file touches localStorage.

import { newCardFields } from './srs.js';
import { dateKey } from './stats.js';

const KEY = 'wordcards:v1';

const emptyState = () => ({ decks: [], cards: [], activity: {} });

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

export async function createDeck(name) {
  const state = read();
  const deck = { id: uid(), name, createdAt: Date.now() };
  state.decks.push(deck);
  write(state);
  return deck;
}

export async function renameDeck(id, name) {
  const state = read();
  const deck = state.decks.find((d) => d.id === id);
  if (deck) deck.name = name;
  write(state);
  return deck;
}

export async function deleteDeck(id) {
  const state = read();
  state.decks = state.decks.filter((d) => d.id !== id);
  state.cards = state.cards.filter((c) => c.deckId !== id);
  write(state);
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

// --- Stats ---

export async function getActivity() {
  return read().activity;
}
