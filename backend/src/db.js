// SQLite connection, schema and row mapping.
// Rows use snake_case columns; the API returns the same camelCase objects the
// frontend keeps in localStorage, so storage.js can switch to fetch() as is.

import Database from 'better-sqlite3';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS decks (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    level      TEXT,
    preset_id  TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cards (
    id            TEXT PRIMARY KEY,
    deck_id       TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    front         TEXT NOT NULL,
    back          TEXT NOT NULL,
    created_at    INTEGER NOT NULL,
    box           INTEGER NOT NULL DEFAULT 0,
    due           INTEGER NOT NULL,
    reviews       INTEGER NOT NULL DEFAULT 0,
    lapses        INTEGER NOT NULL DEFAULT 0,
    last_reviewed INTEGER
  );
  CREATE INDEX IF NOT EXISTS cards_deck_id ON cards(deck_id);

  -- Number of reviews done on each day ("2026-10-02").
  CREATE TABLE IF NOT EXISTS activity (
    day   TEXT PRIMARY KEY,
    count INTEGER NOT NULL
  );

  -- Free-form settings; each value is stored as JSON.
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

// path: a file path, or ':memory:' for tests.
export function openDb(path) {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

export const toDeck = (row) => ({
  id: row.id,
  name: row.name,
  level: row.level,
  ...(row.preset_id ? { presetId: row.preset_id } : {}),
  createdAt: row.created_at,
});

export const toCard = (row) => ({
  id: row.id,
  deckId: row.deck_id,
  front: row.front,
  back: row.back,
  createdAt: row.created_at,
  box: row.box,
  due: row.due,
  reviews: row.reviews,
  lapses: row.lapses,
  lastReviewed: row.last_reviewed,
});

// Named parameters for the INSERT statements below.
export const deckParams = (deck) => ({
  id: deck.id,
  name: deck.name,
  level: deck.level ?? null,
  preset_id: deck.presetId ?? null,
  created_at: deck.createdAt,
});

export const cardParams = (card) => ({
  id: card.id,
  deck_id: card.deckId,
  front: card.front,
  back: card.back,
  created_at: card.createdAt,
  box: card.box,
  due: card.due,
  reviews: card.reviews,
  lapses: card.lapses,
  last_reviewed: card.lastReviewed ?? null,
});

export const INSERT_DECK = `
  INSERT INTO decks (id, name, level, preset_id, created_at)
  VALUES (@id, @name, @level, @preset_id, @created_at)`;

export const INSERT_CARD = `
  INSERT INTO cards (id, deck_id, front, back, created_at, box, due, reviews, lapses, last_reviewed)
  VALUES (@id, @deck_id, @front, @back, @created_at, @box, @due, @reviews, @lapses, @last_reviewed)`;

// Adds `count` reviews to a day's activity.
export function addActivity(db, day, count) {
  db.prepare(`
    INSERT INTO activity (day, count) VALUES (?, ?)
    ON CONFLICT (day) DO UPDATE SET count = count + excluded.count`).run(day, count);
}

export function getActivity(db) {
  return Object.fromEntries(
    db.prepare('SELECT day, count FROM activity ORDER BY day').all().map((r) => [r.day, r.count]));
}

export function getSettings(db) {
  return Object.fromEntries(
    db.prepare('SELECT key, value FROM settings').all().map((r) => [r.key, JSON.parse(r.value)]));
}
