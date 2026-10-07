// Word lookup shared by the reading and podcast pages: tapping a word shows its
// meaning from the ready-made word list (plus the user's own cards) in a sheet
// at the bottom of the screen, and the word can be added to a deck from there.

import * as db from './storage.js';
import { esc } from './util.js';
import { loadPresets, levelName } from './presets.js';
import { lemmas } from './lemmas.js';
import { speak } from './speech.js';

const WORD = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;
const LABEL = /\s*\(([^)]*)\)\s*$/;
const key = (s) => s.toLocaleLowerCase('en').replace(/’/g, "'").trim();

const levelBadge = (level) =>
  `<span class="badge level" title="${esc(levelName(level))}">${esc(level)}</span>`;

// Wraps every word of `text` in a tappable span.
export function wordsHtml(text) {
  let html = '';
  let last = 0;
  for (const m of text.matchAll(WORD)) {
    html += esc(text.slice(last, m.index));
    html += `<span class="w" data-w="${esc(m[0])}">${esc(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  return html + esc(text.slice(last));
}

let dictionary = null;

// word → [{ front, back, level }]
async function loadDictionary() {
  dictionary ??= loadPresets().then((decks) => {
    const map = new Map();
    for (const deck of decks) {
      for (const [front, back] of deck.words) {
        for (const variant of front.replace(LABEL, '').split('/')) {
          const k = key(variant);
          if (!map.has(k)) map.set(k, []);
          if (!map.get(k).some((e) => e.front === front)) map.get(k).push({ front, back, level: deck.level });
        }
      }
    }
    return map;
  }).catch((err) => {
    dictionary = null;
    throw err;
  });
  return dictionary;
}

// The entries for the first form of `word` that is in the dictionary.
function lookup(dict, word) {
  for (const form of lemmas(word)) {
    const found = dict.get(form);
    if (found) return { form, entries: found };
  }
  return { form: lemmas(word)[0], entries: [] };
}

// Makes the words (.w spans) inside `container` tappable and adds the word
// sheet to `root`. New cards go to the deck called `deckName`, whose id is
// remembered in settings[settingsKey]. Returns a cleanup function.
export async function attachWordSheet(root, container, { deckName, settingsKey }) {
  const [cards, settings] = await Promise.all([db.getAllCards(), db.getSettings()]);
  const inDeck = new Set(cards.map((c) => key(c.front.replace(LABEL, ''))));
  const words = () => container.querySelectorAll('.w');
  words().forEach((w) => {
    if (lemmas(w.dataset.w).some((f) => inDeck.has(f))) w.classList.add('in-deck');
  });

  root.insertAdjacentHTML('beforeend', '<aside class="word-sheet" hidden aria-live="polite"></aside>');
  const sheet = root.lastElementChild;
  let selected = null;

  async function show(span) {
    selected?.classList.remove('selected');
    selected = span;
    span.classList.add('selected');
    const word = span.dataset.w;
    sheet.hidden = false;
    root.classList.add('sheet-open');
    sheet.innerHTML = '<p class="muted">Aranıyor…</p>';
    let found;
    try {
      found = lookup(await loadDictionary(), word);
    } catch {
      found = { form: lemmas(word)[0], entries: [] };
    }
    if (selected !== span) return; // another word was tapped meanwhile
    const first = found.entries[0];
    const front = first ? first.front : found.form;
    const back = first ? first.back : '';
    const saved = inDeck.has(key(front.replace(LABEL, '')));
    sheet.innerHTML = `
      <div class="sheet-head">
        <button class="icon-btn" data-action="say" data-text="${esc(found.form)}" aria-label="Dinle">🔊</button>
        <strong class="sheet-word">${esc(word)}</strong>
        ${key(word) !== found.form ? `<span class="muted">→ ${esc(found.form)}</span>` : ''}
        <button class="icon-btn sheet-close" data-action="close" aria-label="Kapat">✕</button>
      </div>
      ${found.entries.length ? `
        <ul class="sheet-meanings">
          ${found.entries.map((e) => `
            <li>${levelBadge(e.level)} <strong>${esc(e.front)}</strong> <span>${esc(e.back)}</span></li>`).join('')}
        </ul>` : '<p class="muted">Bu kelime sözlükte yok. Anlamını kendin yazıp ekleyebilirsin.</p>'}
      ${saved ? '<p class="ok">✓ Bu kelime destelerinde var.</p>' : `
        <form class="sheet-form" autocomplete="off">
          <input name="front" value="${esc(front)}" aria-label="İngilizcesi" required>
          <input name="back" value="${esc(back)}" placeholder="Türkçe anlamı" aria-label="Türkçe anlamı" required>
          <button class="btn primary">+ Desteme ekle</button>
        </form>
        <p class="muted small">"${esc(deckName)}" destesine eklenir.</p>`}`;
  }

  function close() {
    sheet.hidden = true;
    root.classList.remove('sheet-open');
    selected?.classList.remove('selected');
    selected = null;
  }

  async function deckId() {
    const decks = await db.getDecks();
    const existing = decks.find((d) => d.id === settings[settingsKey]) ?? decks.find((d) => d.name === deckName);
    if (existing) return existing.id;
    const deck = await db.createDeck(deckName);
    await db.saveSettings({ [settingsKey]: deck.id });
    settings[settingsKey] = deck.id;
    return deck.id;
  }

  async function addCard(form) {
    const front = form.front.value.trim();
    const back = form.back.value.trim();
    if (!front || !back) return;
    form.querySelector('button').disabled = true;
    await db.createCard(await deckId(), front, back);
    const k = key(front.replace(LABEL, ''));
    inDeck.add(k);
    words().forEach((w) => {
      if (lemmas(w.dataset.w).includes(k)) w.classList.add('in-deck');
    });
    form.parentElement.querySelector('.muted.small')?.remove();
    form.outerHTML = `<p class="ok">✓ "${esc(front)}" ${esc(deckName)} destesine eklendi.</p>`;
  }

  function onWordClick(e) {
    const word = e.target.closest('.w');
    if (word) show(word);
  }

  function onSheetClick(e) {
    const btn = e.target.closest('[data-action]');
    if (btn?.dataset.action === 'say') speak(btn.dataset.text);
    else if (btn?.dataset.action === 'close') close();
  }

  function onSubmit(e) {
    if (!e.target.matches('.sheet-form')) return;
    e.preventDefault();
    addCard(e.target);
  }

  function onKey(e) {
    if (e.key === 'Escape' && !sheet.hidden) close();
  }

  container.addEventListener('click', onWordClick);
  sheet.addEventListener('click', onSheetClick);
  sheet.addEventListener('submit', onSubmit);
  document.addEventListener('keydown', onKey);
  return () => {
    container.removeEventListener('click', onWordClick);
    document.removeEventListener('keydown', onKey);
    root.classList.remove('sheet-open');
  };
}
