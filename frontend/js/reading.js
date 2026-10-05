// Reading: graded news texts (OneStopEnglish corpus, three versions of each
// text). Tapping a word shows its meaning from the ready-made word list and
// can add it to the "Okuma Kelimeleri" deck; the text can also be read aloud.

import * as db from './storage.js';
import { esc } from './util.js';
import { loadPresets, levelName } from './presets.js';
import { lemmas } from './lemmas.js';
import { canSpeak, speak, speakAll, stopSpeaking } from './speech.js';

const VERSIONS = [
  { id: 'ele', name: 'Kolay' },
  { id: 'int', name: 'Orta' },
  { id: 'adv', name: 'Zor' },
];
const READING_DECK = 'Okuma Kelimeleri';
const WORD = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;

let index = null;

async function loadIndex() {
  index ??= fetch('data/texts/index.json')
    .then((res) => {
      if (!res.ok) throw new Error(`texts/index.json: HTTP ${res.status}`);
      return res.json();
    })
    .catch((err) => {
      index = null; // allow a retry on the next visit
      throw err;
    });
  return index;
}

async function loadText(id) {
  const res = await fetch(`data/texts/${encodeURIComponent(id)}.json`);
  if (!res.ok) throw new Error(`texts/${id}.json: HTTP ${res.status}`);
  return res.json();
}

const levelBadge = (level) =>
  `<span class="badge level" title="${esc(levelName(level))} (tahmini)">${esc(level)}</span>`;

const attribution = (source) => `
  <p class="muted small note">
    Metinler: <a href="${esc(source.url)}" target="_blank" rel="noopener">${esc(source.name)}</a>,
    <a href="${esc(source.licenseUrl)}" target="_blank" rel="noopener">${esc(source.license)}</a>.
    Yazım hataları düzeltildi; seviyeler kelime listesine göre tahmin edildi.
  </p>`;

// ---------------------------------------------------------------------------
// List of texts
// ---------------------------------------------------------------------------

export async function renderReadingList(root) {
  let data;
  try {
    data = await loadIndex();
  } catch {
    root.innerHTML = `
      <section class="page-head"><h1>Okuma</h1></section>
      <p class="empty">Metinler yüklenemedi. Sayfayı yenileyip tekrar dene.</p>`;
    return null;
  }
  const settings = await db.getSettings();
  const version = VERSIONS.some((v) => v.id === settings.readingVersion) ? settings.readingVersion : 'ele';
  const read = settings.readTexts ?? {};
  let query = '';

  root.innerHTML = `
    <a href="#/" class="back">← Ana sayfa</a>
    <section class="page-head">
      <h1>Okuma</h1>
      <input type="search" id="text-search" placeholder="Metin ara" aria-label="Metin ara">
    </section>
    <p class="muted">Her metnin üç hâli var. Bilmediğin kelimeye dokun; anlamını gör, destene ekle.</p>
    <div class="chips" role="tablist" aria-label="Zorluk">
      ${VERSIONS.map((v) => `
        <button class="chip ${v.id === version ? 'active' : ''}" data-version="${v.id}">${v.name}</button>`).join('')}
    </div>
    <div class="deck-grid text-grid"></div>
    ${attribution(data.source)}`;

  const grid = root.querySelector('.text-grid');
  function renderGrid() {
    const q = query.trim().toLocaleLowerCase('en');
    const texts = data.texts.filter((t) => !q || t.title.toLocaleLowerCase('en').includes(q));
    grid.innerHTML = texts.length ? texts.map((t) => {
      const v = t.versions[version];
      const done = read[t.id]?.includes(version);
      return `
        <a class="deck-tile text-tile" href="#/reading/${t.id}/${version}">
          <h2 class="tile-title">${done ? '<span class="read-mark" title="Okudun">✓</span> ' : ''}${esc(t.title)}</h2>
          <p class="muted small">${esc(t.summary)}</p>
          <p class="text-meta">${levelBadge(v.level)} <span class="muted small">${v.words} kelime · ~${Math.max(1, Math.round(v.words / 150))} dk</span></p>
        </a>`;
    }).join('') : '<p class="empty">Bu aramaya uyan metin yok.</p>';
  }
  renderGrid();

  const search = root.querySelector('#text-search');
  search.addEventListener('input', () => {
    query = search.value;
    renderGrid();
  });
  root.querySelector('.chips').addEventListener('click', async (e) => {
    const chip = e.target.closest('[data-version]');
    if (!chip) return;
    await db.saveSettings({ readingVersion: chip.dataset.version });
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  return null;
}

// ---------------------------------------------------------------------------
// Dictionary: the ready-made decks plus the user's own cards
// ---------------------------------------------------------------------------

const LABEL = /\s*\(([^)]*)\)\s*$/;
const key = (s) => s.toLocaleLowerCase('en').replace(/’/g, "'").trim();

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

// ---------------------------------------------------------------------------
// Reader
// ---------------------------------------------------------------------------

// Splits a paragraph into sentences, keeping closing quotes with the sentence.
const sentencesOf = (p) => p.split(/(?<=[.!?…]["”’)]?)\s+(?=["“‘(]?[A-Z0-9])/);

function wordsHtml(sentence) {
  let html = '';
  let last = 0;
  for (const m of sentence.matchAll(WORD)) {
    html += esc(sentence.slice(last, m.index));
    html += `<span class="w" data-w="${esc(m[0])}">${esc(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  return html + esc(sentence.slice(last));
}

export async function renderReader(root, id, versionId = 'ele') {
  let data, text;
  try {
    [data, text] = await Promise.all([loadIndex(), loadText(id)]);
  } catch {
    root.innerHTML = `
      <a href="#/reading" class="back">← Okuma</a>
      <p class="empty">Bu metin yüklenemedi.</p>`;
    return null;
  }
  const version = text.versions[versionId] ? versionId : 'ele';
  const { level, paragraphs } = text.versions[version];
  const [cards, settings] = await Promise.all([db.getAllCards(), db.getSettings()]);
  const inDeck = new Set(cards.map((c) => key(c.front.replace(LABEL, ''))));
  const isRead = (settings.readTexts?.[id] ?? []).includes(version);
  const position = data.texts.findIndex((t) => t.id === id);
  const next = data.texts[position + 1];

  const sentences = [];
  const body = paragraphs.map((p) => `<p>${sentencesOf(p).map((s) => {
    sentences.push(s);
    return `<span class="sentence" data-i="${sentences.length - 1}">${wordsHtml(s)}</span>`;
  }).join(' ')}</p>`).join('');

  root.innerHTML = `
    <a href="#/reading" class="back">← Okuma</a>
    <section class="page-head">
      <h1>${esc(text.title)}</h1>
      ${canSpeak ? '<button class="btn" data-action="listen">🔊 Metni dinle</button>' : ''}
    </section>
    <nav class="chips" aria-label="Zorluk">
      ${VERSIONS.map((v) => `
        <a class="chip ${v.id === version ? 'active' : ''}" href="#/reading/${id}/${v.id}">
          ${v.name} <small>${text.versions[v.id].level}</small>
        </a>`).join('')}
    </nav>
    <p class="muted small reader-tip">Bilmediğin kelimeye dokun. Altı noktalı kelimeler destelerinde var.</p>
    <article class="reader" lang="en">${body}</article>
    <div class="reader-end">
      <button class="btn ${isRead ? '' : 'primary'}" data-action="done" ${isRead ? 'disabled' : ''}>
        ${isRead ? '✓ Okundu' : '✓ Okudum'}
      </button>
      ${next ? `<a class="btn" href="#/reading/${next.id}/${version}">Sonraki metin →</a>` : ''}
    </div>
    ${attribution(data.source)}
    <aside class="word-sheet" hidden aria-live="polite"></aside>`;

  const reader = root.querySelector('.reader');
  const sheet = root.querySelector('.word-sheet');
  reader.querySelectorAll('.w').forEach((w) => {
    if (lemmas(w.dataset.w).some((f) => inDeck.has(f))) w.classList.add('in-deck');
  });

  // --- Reading aloud ---

  let speaking = false;
  const listenBtn = root.querySelector('[data-action="listen"]');
  function setSpeaking(on) {
    speaking = on;
    if (listenBtn) listenBtn.textContent = on ? '⏹ Durdur' : '🔊 Metni dinle';
    if (!on) reader.querySelector('.speaking')?.classList.remove('speaking');
  }
  function onSentence(i) {
    reader.querySelector('.speaking')?.classList.remove('speaking');
    if (i < 0) return setSpeaking(false);
    reader.querySelector(`.sentence[data-i="${i}"]`)?.classList.add('speaking');
  }

  // --- Word sheet ---

  let selected = null;

  async function showWord(span) {
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
        <p class="muted small">"${READING_DECK}" destesine eklenir.</p>`}`;
  }

  function closeSheet() {
    sheet.hidden = true;
    root.classList.remove('sheet-open');
    selected?.classList.remove('selected');
    selected = null;
  }

  async function readingDeckId() {
    const decks = await db.getDecks();
    const existing = decks.find((d) => d.id === settings.readingDeck) ?? decks.find((d) => d.name === READING_DECK);
    if (existing) return existing.id;
    const deck = await db.createDeck(READING_DECK);
    await db.saveSettings({ readingDeck: deck.id });
    settings.readingDeck = deck.id;
    return deck.id;
  }

  async function addCard(form) {
    const front = form.front.value.trim();
    const back = form.back.value.trim();
    if (!front || !back) return;
    form.querySelector('button').disabled = true;
    await db.createCard(await readingDeckId(), front, back);
    const k = key(front.replace(LABEL, ''));
    inDeck.add(k);
    reader.querySelectorAll('.w').forEach((w) => {
      if (lemmas(w.dataset.w).includes(k)) w.classList.add('in-deck');
    });
    form.parentElement.querySelector('.muted.small')?.remove();
    form.outerHTML = `<p class="ok">✓ "${esc(front)}" ${READING_DECK} destesine eklendi.</p>`;
  }

  async function markRead() {
    const readTexts = { ...(settings.readTexts ?? {}) };
    readTexts[id] = [...new Set([...(readTexts[id] ?? []), version])];
    await db.saveSettings({ readTexts });
    await db.logActivity();
    const btn = root.querySelector('[data-action="done"]');
    btn.disabled = true;
    btn.classList.remove('primary');
    btn.textContent = '✓ Okundu';
  }

  // --- Events ---

  async function onClick(e) {
    const word = e.target.closest('.w');
    if (word) return showWord(word);
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'say') speak(e.target.closest('[data-action]').dataset.text);
    else if (action === 'close') closeSheet();
    else if (action === 'done') markRead();
    else if (action === 'listen') {
      if (speaking) {
        stopSpeaking();
        setSpeaking(false);
      } else {
        setSpeaking(true);
        speakAll(sentences, onSentence);
      }
    }
  }

  function onSubmit(e) {
    if (!e.target.matches('.sheet-form')) return;
    e.preventDefault();
    addCard(e.target);
  }

  function onKey(e) {
    if (e.key === 'Escape' && !sheet.hidden) closeSheet();
  }

  root.addEventListener('click', onClick);
  root.addEventListener('submit', onSubmit);
  document.addEventListener('keydown', onKey);
  return () => {
    root.removeEventListener('click', onClick);
    root.removeEventListener('submit', onSubmit);
    document.removeEventListener('keydown', onKey);
    root.classList.remove('sheet-open');
    stopSpeaking();
  };
}
