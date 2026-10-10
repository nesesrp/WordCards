// Starts the server. Settings come from environment variables:
//   PORT     (default 3000)
//   DB_PATH  (default backend/data/wordcards.db)

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createApp } from './app.js';

const port = Number(process.env.PORT) || 3000;
const dbPath = process.env.DB_PATH || fileURLToPath(new URL('../data/wordcards.db', import.meta.url));

mkdirSync(dirname(dbPath), { recursive: true });
const db = openDb(dbPath);
const server = createApp(db).listen(port, () => {
  console.log(`WordCards: http://localhost:${port}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
