import { Router } from 'express';
import { getSettings } from '../db.js';
import { body } from '../validate.js';

// Settings are a free-form object (daily goal, read texts, podcast speed …).
export default function settingsRouter(db) {
  const router = Router();

  router.get('/settings', (req, res) => {
    res.json(getSettings(db));
  });

  // Merges the given fields into the settings and returns all of them.
  router.patch('/settings', (req, res) => {
    const fields = body(req);
    const upsert = db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT (key) DO UPDATE SET value = excluded.value`);
    db.transaction(() => {
      for (const [key, value] of Object.entries(fields)) upsert.run(key, JSON.stringify(value ?? null));
    })();
    res.json(getSettings(db));
  });

  return router;
}
