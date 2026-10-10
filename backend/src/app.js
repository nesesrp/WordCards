// Express app: the REST API under /api, and the frontend as static files.
// Kept separate from server.js so tests can create an app with an in-memory db.

import express from 'express';
import { fileURLToPath } from 'node:url';
import decksRouter from './routes/decks.js';
import cardsRouter from './routes/cards.js';
import statsRouter from './routes/stats.js';
import settingsRouter from './routes/settings.js';
import backupRouter from './routes/backup.js';
import { HttpError } from './validate.js';

const FRONTEND_DIR = fileURLToPath(new URL('../../frontend/', import.meta.url));

export function createApp(db) {
  const app = express();
  // Backups and whole levels of ready-made decks can be a few MB.
  app.use(express.json({ limit: '20mb' }));

  const api = express.Router();
  for (const router of [decksRouter, cardsRouter, statsRouter, settingsRouter, backupRouter]) {
    api.use(router(db));
  }
  api.use((req, res) => {
    res.status(404).json({ error: 'Böyle bir API adresi yok.' });
  });
  app.use('/api', api);

  app.use(express.static(FRONTEND_DIR));

  // Errors are returned as { error: "…" }.
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
    } else if (err.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Geçersiz JSON.' });
    } else if (err.type === 'entity.too.large') {
      res.status(413).json({ error: 'İstek çok büyük.' });
    } else if (err.code?.startsWith('SQLITE_CONSTRAINT')) {
      // e.g. a backup with the same id twice
      res.status(400).json({ error: 'Veri geçersiz ya da tekrar eden kayıt içeriyor.' });
    } else {
      console.error(err);
      res.status(500).json({ error: 'Sunucuda bir hata oluştu.' });
    }
  });

  return app;
}
