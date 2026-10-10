import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { dateKey } from '../../frontend/js/stats.js';

// Each test gets a fresh in-memory database and its own server on a free port.
let db;
let server;
let base;

beforeEach(async () => {
  db = openDb(':memory:');
  server = createApp(db).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://localhost:${server.address().port}/api`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
});

async function api(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = res.status === 204 ? null : await res.json();
  return { status: res.status, data };
}

const createDeck = async (name = 'Verbs', level) => (await api('POST', '/decks', { name, level })).data;
const createCard = async (deckId, front = 'go', back = 'gitmek') =>
  (await api('POST', `/decks/${deckId}/cards`, { front, back })).data;

test('creates, lists, updates and deletes a deck', async () => {
  const created = await api('POST', '/decks', { name: '  English Verbs ', level: 'A1' });
  assert.equal(created.status, 201);
  assert.equal(created.data.name, 'English Verbs');
  assert.equal(created.data.level, 'A1');

  const { data: list } = await api('GET', '/decks');
  assert.deepEqual(list, [created.data]);

  const updated = await api('PATCH', `/decks/${created.data.id}`, { name: 'Fiiller', level: null });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.name, 'Fiiller');
  assert.equal(updated.data.level, null);

  assert.equal((await api('DELETE', `/decks/${created.data.id}`)).status, 204);
  assert.equal((await api('GET', `/decks/${created.data.id}`)).status, 404);
});

test('rejects an empty deck name and an unknown level', async () => {
  const empty = await api('POST', '/decks', { name: '   ' });
  assert.equal(empty.status, 400);
  assert.match(empty.data.error, /boş olamaz/);

  assert.equal((await api('POST', '/decks', { name: 'X', level: 'Z9' })).status, 400);
});

test('lists decks newest first', async () => {
  const first = await createDeck('First');
  await new Promise((r) => setTimeout(r, 5));
  const second = await createDeck('Second');
  const { data } = await api('GET', '/decks');
  assert.deepEqual(data.map((d) => d.id), [second.id, first.id]);
});

test('adds, edits and deletes cards', async () => {
  const deck = await createDeck();
  const card = await createCard(deck.id);
  assert.equal(card.deckId, deck.id);
  assert.equal(card.box, 0);
  assert.equal(card.lastReviewed, null);

  const edited = await api('PATCH', `/cards/${card.id}`, { back: 'gitmek, ilerlemek' });
  assert.equal(edited.data.back, 'gitmek, ilerlemek');
  assert.equal(edited.data.front, 'go');

  const { data: cards } = await api('GET', `/decks/${deck.id}/cards`);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].back, 'gitmek, ilerlemek');

  assert.equal((await api('DELETE', `/cards/${card.id}`)).status, 204);
  assert.equal((await api('DELETE', `/cards/${card.id}`)).status, 404);
});

test('adding a card to a missing deck returns 404', async () => {
  const res = await api('POST', '/decks/nope/cards', { front: 'a', back: 'b' });
  assert.equal(res.status, 404);
});

test('deleting a deck deletes its cards', async () => {
  const deck = await createDeck();
  await createCard(deck.id);
  await createCard(deck.id, 'eat', 'yemek');
  await api('DELETE', `/decks/${deck.id}`);
  assert.deepEqual((await api('GET', '/cards')).data, []);
});

test('a review moves the card between boxes and counts as activity', async () => {
  const deck = await createDeck();
  const card = await createCard(deck.id);

  const knew = await api('POST', `/cards/${card.id}/review`, { knew: true });
  assert.equal(knew.data.box, 1);
  assert.equal(knew.data.reviews, 1);
  assert.ok(knew.data.due > Date.now());

  const missed = await api('POST', `/cards/${card.id}/review`, { knew: false });
  assert.equal(missed.data.box, 0);
  assert.equal(missed.data.lapses, 1);

  const { data: stats } = await api('GET', '/stats');
  assert.equal(stats.today, 2);
  assert.equal(stats.currentStreak, 1);
  assert.deepEqual(stats.activity, { [dateKey()]: 2 });

  assert.equal((await api('POST', `/cards/${card.id}/review`, { knew: 'yes' })).status, 400);
});

test('practice activity is added to today', async () => {
  await api('POST', '/activity', {});
  const res = await api('POST', '/activity', { count: 4 });
  assert.equal(res.data.count, 5);
  assert.equal((await api('POST', '/activity', { count: 0 })).status, 400);
});

test('settings are merged', async () => {
  await api('PATCH', '/settings', { dailyGoal: 30, readTexts: ['a'] });
  const { data } = await api('PATCH', '/settings', { podcastSpeed: 1.25 });
  assert.deepEqual(data, { dailyGoal: 30, readTexts: ['a'], podcastSpeed: 1.25 });
});

test('imports ready-made decks in their original order', async () => {
  const res = await api('POST', '/presets/import', {
    presets: [{ id: 'a1-food', name: 'Yiyecek', level: 'A1', words: [['apple', 'elma'], ['bread', 'ekmek']] }],
  });
  assert.equal(res.status, 201);
  assert.equal(res.data[0].presetId, 'a1-food');

  const { data: cards } = await api('GET', `/decks/${res.data[0].id}/cards`);
  assert.deepEqual(cards.map((c) => c.front), ['apple', 'bread']);
});

test('a bad preset rolls back the whole import', async () => {
  const res = await api('POST', '/presets/import', {
    presets: [
      { id: 'ok', name: 'OK', level: 'A1', words: [['a', 'b']] },
      { id: 'bad', name: 'Bad', level: 'Z9', words: [] },
    ],
  });
  assert.equal(res.status, 400);
  assert.deepEqual((await api('GET', '/decks')).data, []);
});

test('a backup can be restored', async () => {
  const deck = await createDeck('Verbs', 'B1');
  const card = await createCard(deck.id);
  await api('POST', `/cards/${card.id}/review`, { knew: true });
  await api('PATCH', '/settings', { dailyGoal: 50 });

  const { data: backup } = await api('GET', '/backup');
  assert.equal(backup.app, 'wordcards');
  assert.ok(backup.data.settings.lastBackup);

  // Wipe everything, then restore.
  await api('DELETE', `/decks/${deck.id}`);
  const restored = await api('POST', '/backup', backup);
  assert.deepEqual(restored.data, { decks: 1, cards: 1 });

  const { data: again } = await api('GET', '/backup');
  assert.deepEqual(again.data.decks, backup.data.decks);
  assert.deepEqual(again.data.cards, backup.data.cards);
  assert.deepEqual(again.data.activity, backup.data.activity);
  assert.equal(again.data.settings.dailyGoal, 50);
});

test('a backup made in the browser can be restored', async () => {
  // Shape written by frontend/js/storage.js exportBackup(); cards of a deleted
  // deck are skipped.
  const backup = {
    app: 'wordcards', version: 1, exportedAt: '2026-10-01T10:00:00.000Z',
    data: {
      decks: [{ id: 'd1', name: 'Food', level: 'A1', presetId: 'a1-food', createdAt: 1 }],
      cards: [
        { id: 'c1', deckId: 'd1', front: 'apple', back: 'elma', createdAt: 1, box: 2, due: 5, reviews: 3, lapses: 0, lastReviewed: 4 },
        { id: 'c2', deckId: 'gone', front: 'x', back: 'y', createdAt: 1, box: 0, due: 1, reviews: 0, lapses: 0, lastReviewed: null },
      ],
      activity: { '2026-09-30': 12 },
      settings: { posLabelsEn: true },
    },
  };
  const res = await api('POST', '/backup', backup);
  assert.deepEqual(res.data, { decks: 1, cards: 1 });
  assert.equal((await api('GET', '/cards')).data[0].box, 2);
  assert.deepEqual((await api('GET', '/stats')).data.activity, { '2026-09-30': 12 });
});

test('rejects files that are not backups and keeps the data', async () => {
  await createDeck();
  const res = await api('POST', '/backup', { app: 'other', data: {} });
  assert.equal(res.status, 400);
  assert.equal((await api('GET', '/decks')).data.length, 1);
});

test('returns JSON errors for bad JSON and unknown routes', async () => {
  const bad = await fetch(`${base}/decks`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{nope',
  });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error, 'Geçersiz JSON.');

  const missing = await api('GET', '/nothing');
  assert.equal(missing.status, 404);
  assert.ok(missing.data.error);
});
