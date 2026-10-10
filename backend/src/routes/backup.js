import { Router } from 'express';
import { newCardFields } from '../../../frontend/js/srs.js';
import {
  toDeck, toCard, deckParams, cardParams, INSERT_DECK, INSERT_CARD, getActivity, getSettings,
} from '../db.js';
import { HttpError, body, isObject } from '../validate.js';

// Same file format as the frontend's backup (storage.js), so a backup made in
// the browser can be restored on the server and the other way round.
const BACKUP_APP = 'wordcards';
const BACKUP_VERSION = 1;

const isText = (v) => typeof v === 'string';
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

export default function backupRouter(db) {
  const router = Router();

  router.get('/backup', (req, res) => {
    db.prepare(`
      INSERT INTO settings (key, value) VALUES ('lastBackup', ?)
      ON CONFLICT (key) DO UPDATE SET value = excluded.value`).run(JSON.stringify(Date.now()));
    res.json({
      app: BACKUP_APP,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      data: {
        decks: db.prepare('SELECT * FROM decks ORDER BY created_at DESC').all().map(toDeck),
        cards: db.prepare('SELECT * FROM cards ORDER BY rowid').all().map(toCard),
        activity: getActivity(db),
        settings: getSettings(db),
      },
    });
  });

  // Replaces all data with a backup.
  router.post('/backup', (req, res) => {
    const backup = body(req);
    const data = backup.app === BACKUP_APP ? backup.data : null;
    const valid = isObject(data)
      && Array.isArray(data.decks) && data.decks.every((d) => isObject(d) && isText(d.id) && isText(d.name))
      && Array.isArray(data.cards) && data.cards.every((c) =>
        isObject(c) && isText(c.id) && isText(c.deckId) && isText(c.front) && isText(c.back))
      && (data.activity === undefined || isObject(data.activity))
      && (data.settings === undefined || isObject(data.settings));
    if (!valid) throw new HttpError(400, 'Bu dosya bir WordCards yedeği değil ya da bozuk.');
    if (backup.version > BACKUP_VERSION) {
      throw new HttpError(400, 'Bu yedek uygulamanın daha yeni bir sürümüyle alınmış.');
    }

    // Cards whose deck is missing can't be shown anywhere, so they are skipped.
    const deckIds = new Set(data.decks.map((d) => d.id));
    const cards = data.cards.filter((c) => deckIds.has(c.deckId));
    const now = Date.now();

    db.transaction(() => {
      db.exec('DELETE FROM cards; DELETE FROM decks; DELETE FROM activity; DELETE FROM settings;');
      const insertDeck = db.prepare(INSERT_DECK);
      for (const d of data.decks) {
        insertDeck.run(deckParams({ ...d, createdAt: isNumber(d.createdAt) ? d.createdAt : now }));
      }
      const insertCard = db.prepare(INSERT_CARD);
      for (const c of cards) {
        // Fill in scheduling fields that are missing or broken with a new card's.
        const fresh = { createdAt: now, ...newCardFields(now) };
        for (const key of Object.keys(fresh)) {
          if (isNumber(c[key]) || (key === 'lastReviewed' && c[key] === null)) fresh[key] = c[key];
        }
        insertCard.run(cardParams({ ...c, ...fresh }));
      }
      const insertDay = db.prepare('INSERT INTO activity (day, count) VALUES (?, ?)');
      for (const [day, count] of Object.entries(data.activity ?? {})) {
        if (isNumber(count) && count > 0) insertDay.run(day, count);
      }
      const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
      for (const [key, value] of Object.entries(data.settings ?? {})) {
        insertSetting.run(key, JSON.stringify(value ?? null));
      }
    })();

    res.json({ decks: data.decks.length, cards: cards.length });
  });

  return router;
}
