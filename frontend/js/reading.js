// Reading: graded news texts (OneStopEnglish corpus, three versions of each
// text). Tapping a word shows its meaning from the ready-made word list and
// can add it to the "Okuma Kelimeleri" deck; the text can also be read aloud.

import * as db from './storage.js';
import { esc } from './util.js';
import { levelName } from './presets.js';
import { canSpeak, speakAll, stopSpeaking } from './speech.js';
import { attachWordSheet, wordsHtml } from './wordsheet.js';

const VERSIONS = [
  { id: 'ele', name: 'Kolay' },
  { id: 'int', name: 'Orta' },
  { id: 'adv', name: 'Zor' },
];
const READING_DECK = 'Okuma Kelimeleri';

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
      <section class="page-head"><h1>Reading</h1></section>
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
      <h1>Reading</h1>
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
// Reader
// ---------------------------------------------------------------------------

// Splits a paragraph into sentences, keeping closing quotes with the sentence.
const sentencesOf = (p) => p.split(/(?<=[.!?…]["”’)]?)\s+(?=["“‘(]?[A-Z0-9])/);

export async function renderReader(root, id, versionId = 'ele') {
  let data, text;
  try {
    [data, text] = await Promise.all([loadIndex(), loadText(id)]);
  } catch {
    root.innerHTML = `
      <a href="#/reading" class="back">← Reading</a>
      <p class="empty">Bu metin yüklenemedi.</p>`;
    return null;
  }
  const version = text.versions[versionId] ? versionId : 'ele';
  const { paragraphs } = text.versions[version];
  const settings = await db.getSettings();
  const isRead = (settings.readTexts?.[id] ?? []).includes(version);
  const position = data.texts.findIndex((t) => t.id === id);
  const next = data.texts[position + 1];

  const sentences = [];
  const body = paragraphs.map((p) => `<p>${sentencesOf(p).map((s) => {
    sentences.push(s);
    return `<span class="sentence" data-i="${sentences.length - 1}">${wordsHtml(s)}</span>`;
  }).join(' ')}</p>`).join('');

  root.innerHTML = `
    <a href="#/reading" class="back">← Reading</a>
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
    ${attribution(data.source)}`;

  const reader = root.querySelector('.reader');
  const detachSheet = await attachWordSheet(root, reader, { deckName: READING_DECK, settingsKey: 'readingDeck' });

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

  function onClick(e) {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'done') markRead();
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

  root.addEventListener('click', onClick);
  return () => {
    root.removeEventListener('click', onClick);
    detachSheet();
    stopSpeaking();
  };
}
