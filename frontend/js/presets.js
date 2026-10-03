// Ready-made English → Turkish word decks, grouped by CEFR level.
// The decks live in data/wordlist.json, which scripts/build-wordlist.mjs
// generates from the CEFR-J / Octanove word lists and Wiktionary.

export const LEVELS = [
  { id: 'A1', name: 'Başlangıç' },
  { id: 'A2', name: 'Temel' },
  { id: 'B1', name: 'Orta' },
  { id: 'B2', name: 'Orta üstü' },
  { id: 'C1', name: 'İleri' },
  { id: 'C2', name: 'Uzman' },
];

export const levelName = (id) => LEVELS.find((l) => l.id === id)?.name ?? '';

let presets = null;

// Each deck: { id, level, kind: 'topic' | 'pos', name, words: [[front, back], ...] }
export async function loadPresets() {
  presets ??= fetch('data/wordlist.json')
    .then((res) => {
      if (!res.ok) throw new Error(`wordlist.json: HTTP ${res.status}`);
      return res.json();
    })
    .then((data) => data.decks)
    .catch((err) => {
      presets = null; // allow a retry on the next visit
      throw err;
    });
  return presets;
}
