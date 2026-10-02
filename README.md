# WordCards

A flashcard app for learning vocabulary with spaced repetition. The UI is in Turkish; the code, comments and docs are in English.

## Features

- **Decks:** create, rename and delete decks (e.g. "English Verbs", "Spanish Food")
- **Cards:** add, edit and delete cards with a word on the front and its meaning on the back
- **Study mode:** flip the card and answer "Bildim" (knew it) or "Bilemedim" (didn't know). Keyboard shortcuts: `Space` flips the card, `1` means "Bilemedim", `2` means "Bildim"
- **Spaced repetition:** uses the Leitner box system. A card you know comes back after 1, 3, 7, 16 and then 35 days. A card you miss goes back to the first box and shows up again later in the same session
- **Progress:** cards learned, daily streak, longest streak and activity for the last 14 days
- **Persistent data:** stored in the browser's `localStorage` for now

## Running the frontend

The frontend uses ES modules, so open it through a small local server instead of double-clicking the file:

```bash
cd frontend
python3 -m http.server 5173
# or: npx serve .
```

Then go to http://localhost:5173 in your browser.

## Project structure

```
frontend/
  index.html
  css/style.css
  js/app.js       # routing and views (UI)
  js/storage.js   # data layer (localStorage for now)
  js/srs.js       # spaced repetition algorithm
  js/stats.js     # streak and activity calculations
```

## Roadmap: backend

**Stack:** Node.js + Express + SQLite

- **Node.js:** the backend uses the same language as the frontend (JavaScript), and the frontend's `srs.js` and `stats.js` can be reused on the server as they are.
- **Express:** a small, widely used web framework for building a REST API with little code.
- **SQLite:** a single-file database (via `better-sqlite3`), so there is no database server to install or run. If the app grows, it can be swapped for PostgreSQL later without changing the API.

Planned structure:

```
backend/
  package.json
  src/
    server.js       # Express app, serves the API and the frontend
    db.js           # SQLite connection and schema
    routes/
      decks.js
      cards.js
      stats.js
```

Planned API:

| Method | Endpoint                 | Description                          |
| ------ | ------------------------ | ------------------------------------ |
| GET    | `/api/decks`             | List decks                           |
| POST   | `/api/decks`             | Create a deck                        |
| PATCH  | `/api/decks/:id`         | Rename a deck                        |
| DELETE | `/api/decks/:id`         | Delete a deck and its cards          |
| GET    | `/api/decks/:id/cards`   | List the cards in a deck             |
| POST   | `/api/decks/:id/cards`   | Add a card                           |
| PATCH  | `/api/cards/:id`         | Edit a card                          |
| DELETE | `/api/cards/:id`         | Delete a card                        |
| POST   | `/api/cards/:id/review`  | Save a study answer (`{ knew: true }`) |
| GET    | `/api/stats`             | Streak and activity data             |

**Frontend migration:** only `frontend/js/storage.js` needs to change. Its functions are already async, so their bodies will be replaced with `fetch('/api/...')` calls and the rest of the UI code stays as it is.

**Later:** user accounts (so each user has their own decks), and importing/exporting decks.
