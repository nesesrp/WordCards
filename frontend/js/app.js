import * as db from './storage.js';
import { review, isDue, isLearned, dueLabel, LEARNED_BOX } from './srs.js';
import { currentStreak, longestStreak, lastNDays, dateKey } from './stats.js';
import { LEVELS, levelName, loadPresets } from './presets.js';
import { renderPractice } from './practice.js';
import { renderReadingList, renderReader } from './reading.js';
import { renderPodcastList, renderEpisode } from './podcast.js';
import { esc, shuffle } from './util.js';
import { initThemeToggle } from './theme.js';

const app = document.getElementById('app');

const levelBadge = (level) =>
  level ? `<span class="badge level" title="${esc(levelName(level))}">${esc(level)}</span>` : '';

const levelOptions = (selected) => `
  <option value="">Seviye yok</option>
  ${LEVELS.map((l) => `
    <option value="${l.id}" ${l.id === selected ? 'selected' : ''}>${l.id} · ${l.name}</option>`).join('')}`;

// Row of level filter chips. `counts` maps a level to how many items it has.
const levelChips = (active, counts, { all = true } = {}) => `
  <div class="chips" role="tablist">
    ${all ? `<button class="chip ${active ? '' : 'active'}" data-level="">Tümü</button>` : ''}
    ${LEVELS.map((l) => `
      <button class="chip ${l.id === active ? 'active' : ''}" data-level="${l.id}" title="${l.name}">
        ${l.id}${counts[l.id] ? ` <small>${counts[l.id]}</small>` : ''}
      </button>`).join('')}
  </div>`;

// ---------------------------------------------------------------------------
// Routing (#/ , #/decks , #/deck/:id , #/study/:id[/all] , #/practice/:mode ,
// #/reading[/:id[/:version]] , #/podcast[/:id] , #/library , #/stats)
// ---------------------------------------------------------------------------

const routes = [
  [/^#\/?$/, renderHub],
  [/^#\/decks$/, renderDecks],
  [/^#\/practice\/(writing|listening|dictation|speaking|game)$/, async (mode) => {
    cleanup = await renderPractice(app, mode);
  }],
  [/^#\/reading$/, async () => {
    cleanup = await renderReadingList(app);
  }],
  [/^#\/reading\/([\w-]+)(?:\/(ele|int|adv))?$/, async (id, version) => {
    cleanup = await renderReader(app, id, version);
  }],
  [/^#\/podcast$/, async () => {
    cleanup = await renderPodcastList(app);
  }],
  [/^#\/podcast\/([\w-]+)$/, async (id) => {
    cleanup = await renderEpisode(app, id);
  }],
  [/^#\/deck\/([\w-]+)$/, renderDeck],
  [/^#\/study\/([\w-]+)(?:\/(all))?$/, renderStudy],
  [/^#\/library$/, renderLibrary],
  [/^#\/stats$/, renderStats],
];

// Things to tear down when a view is left (e.g. keyboard listeners).
let cleanup = null;

async function router() {
  cleanup?.();
  cleanup = null;
  const hash = location.hash || '#/';
  const route = routes.find(([re]) => re.test(hash));
  if (!route) {
    location.hash = '#/';
    return;
  }
  const [re, view] = route;
  await view(...hash.match(re).slice(1));
  updateNav(hash);
  window.scrollTo(0, 0);
}

async function updateNav(hash) {
  const section = hash.startsWith('#/stats') ? 'stats'
    : hash.startsWith('#/library') ? 'library'
    : /^#\/(decks|deck\/|study\/)/.test(hash) ? 'decks' : 'home';
  document.querySelectorAll('[data-nav]').forEach((a) =>
    a.classList.toggle('active', a.dataset.nav === section));
  const streak = currentStreak(await db.getActivity());
  document.getElementById('streak').textContent = streak ? `🔥 ${streak} gün` : '';
}

initThemeToggle(document.getElementById('theme-toggle'));
window.addEventListener('hashchange', router);
router();

function notFound() {
  app.innerHTML = `
    <p class="empty">Aradığın deste bulunamadı.</p>
    <p class="center"><a class="btn" href="#/decks">Destelere dön</a></p>`;
}

// ---------------------------------------------------------------------------
// Home: entry point to every way of practising
// ---------------------------------------------------------------------------

async function renderHub() {
  const [cards, activity] = await Promise.all([db.getAllCards(), db.getActivity()]);
  const now = Date.now();
  const due = cards.filter((c) => isDue(c, now)).length;
  const streak = currentStreak(activity, now);

  // Section names stay in English on purpose: they name the skills being learned.
  const tile = ({ href, icon, title, color, badge }) => `
    <${href ? `a href="${href}"` : 'div aria-disabled="true"'} class="hub-tile ${color} ${href ? '' : 'disabled'}">
      ${badge ? `<span class="hub-badge" title="${badge.title}">${badge.text}</span>` : ''}
      <span class="hub-icon" aria-hidden="true">${icon}</span>
      <span class="hub-title">${title}</span>
    </${href ? 'a' : 'div'}>`;

  app.innerHTML = `
    <section class="hero">
      <h1>Bugün ne çalışalım?</h1>
      ${cards.length ? `
        <div class="hero-stats">
          <span class="pill">📚 ${cards.length.toLocaleString('tr')} kelime</span>
          ${streak ? `<span class="pill">🔥 ${streak} günlük seri</span>` : ''}
          ${due ? `<a class="pill due" href="#/decks">⏰ ${due} kart bekliyor</a>` : ''}
        </div>` : `
        <p class="muted">Başlamak için seviyene uygun hazır bir deste ekle ya da kendi desteni oluştur.</p>
        <a class="btn primary" href="#/library">📚 Hazır desteler</a>`}
    </section>
    <div class="hub-grid">
      ${tile({ href: '#/practice/listening', icon: '🎧', title: 'Listening', color: 'sky' })}
      ${tile({ href: '#/practice/speaking', icon: '🎤', title: 'Speaking', color: 'violet' })}
      ${tile({ href: '#/practice/writing', icon: '✍️', title: 'Writing', color: 'orange' })}
      ${tile({
        href: '#/decks', icon: '🗂️', title: 'Vocabulary', color: 'slate',
        badge: due ? { text: due, title: `${due} kart tekrar bekliyor` } : null,
      })}
      ${tile({ href: '#/reading', icon: '📖', title: 'Reading', color: 'teal' })}
      ${tile({ href: '#/podcast', icon: '🎙️', title: 'Podcast', color: 'pink' })}
      ${tile({ href: '#/practice/game', icon: '🎮', title: 'Game', color: 'green' })}
    </div>`;
}

// ---------------------------------------------------------------------------
// Decks: list of decks
// ---------------------------------------------------------------------------

// Level filter on the decks page; kept while the app is open.
let homeLevel = '';

async function renderDecks() {
  const [decks, cards] = await Promise.all([db.getDecks(), db.getAllCards()]);
  const now = Date.now();
  const counts = {};
  decks.forEach((d) => { if (d.level) counts[d.level] = (counts[d.level] || 0) + 1; });
  if (homeLevel && !counts[homeLevel]) homeLevel = '';
  const shown = homeLevel ? decks.filter((d) => d.level === homeLevel) : decks;

  app.innerHTML = `
    <section class="page-head">
      <h1>Destelerim</h1>
      <a class="btn" href="#/library">📚 Hazır desteler</a>
    </section>
    <form class="inline-form" id="new-deck">
      <input name="deckName" placeholder="Yeni deste adı (örn. İngilizce Fiiller)" maxlength="60" required>
      <select name="level" aria-label="Seviye">${levelOptions('')}</select>
      <button class="btn primary">Deste oluştur</button>
    </form>
    ${Object.keys(counts).length ? levelChips(homeLevel, counts) : ''}
    ${shown.length
      ? `<div class="deck-grid">${shown
          .map((d) => deckTile(d, cards.filter((c) => c.deckId === d.id), now))
          .join('')}</div>`
      : `<p class="empty">Henüz bir desten yok. Kendi desteni oluştur ya da
          <a href="#/library">seviyene uygun hazır bir deste ekle</a>.</p>`}`;

  app.querySelector('#new-deck').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = e.target.deckName.value.trim();
    if (!name) return;
    const deck = await db.createDeck(name, e.target.level.value || null);
    location.hash = `#/deck/${deck.id}`;
  });

  app.querySelector('.chips')?.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-level]');
    if (!chip) return;
    homeLevel = chip.dataset.level;
    renderDecks();
  });
}

function deckTile(deck, cards, now) {
  const due = cards.filter((c) => isDue(c, now)).length;
  const learned = cards.filter(isLearned).length;
  const pct = cards.length ? Math.round((learned / cards.length) * 100) : 0;
  return `
    <article class="deck-tile">
      <a href="#/deck/${deck.id}" class="deck-link">
        <h2>${levelBadge(deck.level)} ${esc(deck.name)}</h2>
        <p class="muted">${cards.length} kart · ${learned} öğrenildi</p>
      </a>
      <div class="bar" title="%${pct} öğrenildi"><span style="width:${pct}%"></span></div>
      <div class="tile-actions">
        <span class="badge ${due ? 'due' : ''}">${due ? `${due} kart bekliyor` : 'Tekrar yok'}</span>
        ${due ? `<a class="btn primary small" href="#/study/${deck.id}">Çalış</a>` : ''}
      </div>
    </article>`;
}

// ---------------------------------------------------------------------------
// Deck detail: add / edit / delete cards
// ---------------------------------------------------------------------------

async function renderDeck(id) {
  // Drop the previous listener when the view re-renders itself.
  cleanup?.();
  cleanup = null;
  const deck = await db.getDeck(id);
  if (!deck) return notFound();
  const cards = await db.getCards(id);
  const now = Date.now();
  const due = cards.filter((c) => isDue(c, now)).length;

  const studyBtn = !cards.length
    ? ''
    : due
      ? `<a class="btn primary" href="#/study/${id}">Çalış (${due})</a>`
      : `<a class="btn" href="#/study/${id}/all" title="Bugün tekrar bekleyen kart yok">Hepsini tekrar et</a>`;

  app.innerHTML = `
    <a href="#/decks" class="back">← Desteler</a>
    <section class="page-head">
      <h1 id="deck-title">${levelBadge(deck.level)} ${esc(deck.name)}</h1>
      <div class="head-actions">
        ${studyBtn}
        <button class="btn" data-action="rename">Düzenle</button>
        <button class="btn danger" data-action="delete-deck">Desteyi sil</button>
      </div>
    </section>

    <form class="card-form" id="new-card">
      <input name="front" placeholder="Ön yüz — kelime" maxlength="200" required>
      <input name="back" placeholder="Arka yüz — anlamı" maxlength="500" required>
      <button class="btn primary">Kart ekle</button>
    </form>

    <h2 class="section-title">Kartlar <span class="muted">(${cards.length})</span></h2>
    <ul class="card-list">
      ${cards.map((c) => cardRow(c, now)).join('') || '<li class="empty">Bu destede henüz kart yok.</li>'}
    </ul>`;

  const form = app.querySelector('#new-card');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const front = form.front.value.trim();
    const back = form.back.value.trim();
    if (!front || !back) return;
    await db.createCard(id, front, back);
    await renderDeck(id);
    app.querySelector('#new-card').front.focus();
  });

  app.addEventListener('click', onDeckClick);
  cleanup = () => app.removeEventListener('click', onDeckClick);

  async function onDeckClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const row = btn.closest('.card-row');
    const card = row && cards.find((c) => c.id === row.dataset.id);

    switch (btn.dataset.action) {
      case 'rename':
        startRename();
        break;
      case 'delete-deck':
        if (confirm(`"${deck.name}" destesi ve içindeki ${cards.length} kart silinsin mi?`)) {
          await db.deleteDeck(id);
          location.hash = '#/decks';
        }
        break;
      case 'edit':
        startEdit(row, card);
        break;
      case 'delete':
        await db.deleteCard(card.id);
        await renderDeck(id);
        break;
    }
  }

  function startRename() {
    const title = app.querySelector('#deck-title');
    title.innerHTML = `
      <form class="inline-form rename">
        <input name="deckName" value="${esc(deck.name)}" maxlength="60" required>
        <select name="level" aria-label="Seviye">${levelOptions(deck.level)}</select>
        <button class="btn primary small">Kaydet</button>
      </form>`;
    const f = title.querySelector('form');
    f.deckName.select();
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = f.deckName.value.trim();
      if (!name) return;
      await db.updateDeck(id, { name, level: f.level.value || null });
      await renderDeck(id);
    });
  }

  function startEdit(row, card) {
    row.classList.add('editing');
    row.innerHTML = `
      <form class="card-form edit">
        <input name="front" value="${esc(card.front)}" maxlength="200" required>
        <input name="back" value="${esc(card.back)}" maxlength="500" required>
        <button class="btn primary small">Kaydet</button>
        <button type="button" class="btn small" data-cancel>Vazgeç</button>
      </form>`;
    const f = row.querySelector('form');
    f.front.focus();
    f.querySelector('[data-cancel]').addEventListener('click', () => {
      renderDeck(id);
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const front = f.front.value.trim();
      const back = f.back.value.trim();
      if (!front || !back) return;
      await db.updateCard(card.id, { front, back });
      await renderDeck(id);
    });
  }
}

function cardRow(c, now) {
  const level = c.reviews === 0 ? 'Yeni' : isLearned(c) ? 'Öğrenildi' : `Seviye ${c.box}/${LEARNED_BOX}`;
  const levelClass = c.reviews === 0 ? 'new' : isLearned(c) ? 'learned' : '';
  return `
    <li class="card-row" data-id="${c.id}">
      <div class="card-text">
        <span class="front">${esc(c.front)}</span>
        <span class="back">${esc(c.back)}</span>
      </div>
      <div class="card-meta">
        <span class="badge ${levelClass}">${level}</span>
        <span class="muted small">Tekrar: ${dueLabel(c, now)}</span>
      </div>
      <div class="row-actions">
        <button class="icon-btn" data-action="edit" title="Düzenle" aria-label="Düzenle">✏️</button>
        <button class="icon-btn" data-action="delete" title="Sil" aria-label="Sil">🗑️</button>
      </div>
    </li>`;
}

// ---------------------------------------------------------------------------
// Study mode
// ---------------------------------------------------------------------------

async function renderStudy(id, all) {
  const deck = await db.getDeck(id);
  if (!deck) return notFound();

  const now = Date.now();
  const allCards = await db.getCards(id);
  const cards = all ? allCards : allCards.filter((c) => isDue(c, now));

  if (!cards.length) {
    app.innerHTML = `
      <a href="#/deck/${id}" class="back">← ${esc(deck.name)}</a>
      <div class="done">
        <div class="done-emoji">✅</div>
        <h1>Bugünlük bu kadar!</h1>
        <p class="muted">Bu destede şu an tekrar bekleyen kart yok.</p>
        <div class="done-actions">
          ${allCards.length ? `<a class="btn" href="#/study/${id}/all">Yine de hepsini tekrar et</a>` : ''}
          <a class="btn primary" href="#/deck/${id}">Desteye dön</a>
        </div>
      </div>`;
    return;
  }

  const byId = new Map(cards.map((c) => [c.id, c]));
  const queue = shuffle(cards.map((c) => c.id));
  const total = queue.length;
  const missed = new Set();
  let done = 0;
  let flipped = false;
  let busy = false;

  function show() {
    if (!queue.length) return finish();
    const card = byId.get(queue[0]);
    flipped = false;
    app.innerHTML = `
      <a href="#/deck/${id}" class="back">← ${esc(deck.name)}</a>
      <div class="study-head">
        <div class="bar"><span style="width:${(done / total) * 100}%"></span></div>
        <span class="muted small">${done} / ${total}</span>
      </div>
      <div class="flashcard" data-action="flip" role="button" tabindex="0" aria-label="Kartı çevir">
        <div class="flashcard-inner">
          <div class="face face-front">
            <span class="hint">Kelime</span>
            <p>${esc(card.front)}</p>
          </div>
          <div class="face face-back">
            <span class="hint">Anlamı</span>
            <p>${esc(card.back)}</p>
          </div>
        </div>
      </div>
      <div class="study-actions" id="actions">
        <button class="btn primary big" data-action="flip">Çevir <kbd>Boşluk</kbd></button>
      </div>`;
  }

  function flip() {
    if (flipped) return;
    flipped = true;
    app.querySelector('.flashcard').classList.add('flipped');
    app.querySelector('#actions').innerHTML = `
      <button class="btn danger big" data-action="miss">Bilemedim <kbd>1</kbd></button>
      <button class="btn success big" data-action="know">Bildim <kbd>2</kbd></button>`;
  }

  async function answer(knew) {
    if (!flipped || busy) return;
    busy = true;
    const cardId = queue.shift();
    const updated = review(byId.get(cardId), knew);
    byId.set(cardId, updated);
    await db.saveReview(updated);
    if (knew) {
      done++;
    } else {
      // A missed card comes back a few cards later in this session.
      missed.add(cardId);
      queue.splice(Math.min(queue.length, 3), 0, cardId);
    }
    busy = false;
    show();
  }

  async function finish() {
    const streak = currentStreak(await db.getActivity());
    updateNav(location.hash);
    app.innerHTML = `
      <div class="done">
        <div class="done-emoji">🎉</div>
        <h1>Tebrikler!</h1>
        <p>${total} kartı tamamladın${missed.size ? `, ${missed.size} tanesini ilk seferde bilemedin` : ' ve hepsini ilk seferde bildin'}.</p>
        ${streak ? `<p class="streak-big">🔥 ${streak} günlük seri</p>` : ''}
        <div class="done-actions">
          <a class="btn" href="#/decks">Desteler</a>
          <a class="btn primary" href="#/deck/${id}">Desteye dön</a>
        </div>
      </div>`;
  }

  function onClick(e) {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'flip') flip();
    else if (action === 'know') answer(true);
    else if (action === 'miss') answer(false);
  }

  function onKey(e) {
    if (e.target.closest?.('input, textarea')) return;
    if (e.key === ' ' || e.key === 'Enter') {
      // Let a focused button/link handle its own activation.
      if (e.target.closest?.('a, button')) return;
      e.preventDefault();
      flip();
    } else if (e.key === '1' || e.key === 'ArrowLeft') {
      answer(false);
    } else if (e.key === '2' || e.key === 'ArrowRight') {
      answer(true);
    }
  }

  app.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);
  cleanup = () => {
    app.removeEventListener('click', onClick);
    document.removeEventListener('keydown', onKey);
  };
  show();
}

// ---------------------------------------------------------------------------
// Library: ready-made decks by CEFR level
// ---------------------------------------------------------------------------

async function renderLibrary() {
  let all;
  try {
    all = await loadPresets();
  } catch {
    app.innerHTML = `
      <section class="page-head"><h1>Hazır Desteler</h1></section>
      <p class="empty">Kelime listesi yüklenemedi. Sayfayı yenileyip tekrar dene.</p>`;
    return;
  }
  const [decks, settings] = await Promise.all([db.getDecks(), db.getSettings()]);
  const level = settings.level || LEVELS[0].id;
  const presets = all.filter((p) => p.level === level);
  // presetId -> the user's copy, so a preset isn't added twice by accident.
  const added = new Map(decks.filter((d) => d.presetId).map((d) => [d.presetId, d]));
  const missing = presets.filter((p) => !added.has(p.id));
  const wordCount = (list) => list.reduce((n, p) => n + p.words.length, 0);
  const counts = {};
  all.forEach((p) => { counts[p.level] = (counts[p.level] || 0) + 1; });

  const section = (title, list) => list.length ? `
    <h2 class="section-title">${title}</h2>
    <div class="deck-grid">${list.map((p) => presetTile(p, added.get(p.id))).join('')}</div>` : '';

  app.innerHTML = `
    <section class="page-head">
      <h1>Hazır Desteler</h1>
      ${missing.length > 1
        ? `<button class="btn primary" data-action="add-all">${level} destelerinin hepsini ekle (${missing.length})</button>`
        : ''}
    </section>
    <p class="muted">Seviyeni seç; o seviyeye uygun İngilizce → Türkçe kelime destelerini tek tıkla ekle.</p>
    ${levelChips(level, counts, { all: false })}
    <p class="level-title">
      <strong>${level}</strong> · ${esc(levelName(level))}
      <span class="muted small">· ${presets.length} deste, ${wordCount(presets).toLocaleString('tr')} kelime</span>
    </p>
    ${section('Konular', presets.filter((p) => p.kind === 'topic'))}
    ${section('Kelime türleri', presets.filter((p) => p.kind !== 'topic'))}
    <p class="muted small note">
      Kelimeler ve seviyeler: CEFR-J Vocabulary Profile ve Octanove C1/C2 listeleri.
      Türkçe karşılıklar: Vikisözlük (kontrol edilip düzeltildi).
    </p>`;

  let busy = false;
  app.addEventListener('click', onClick);
  cleanup = () => app.removeEventListener('click', onClick);

  async function onClick(e) {
    const chip = e.target.closest('[data-level]');
    const btn = e.target.closest('[data-action]');
    if (busy) return;
    if (chip) {
      await db.saveSettings({ level: chip.dataset.level });
    } else if (btn?.dataset.action === 'add') {
      busy = true;
      await db.importPresets([presets.find((p) => p.id === btn.dataset.id)]);
    } else if (btn?.dataset.action === 'add-all') {
      const words = wordCount(missing);
      if (!confirm(`${missing.length} deste (${words.toLocaleString('tr')} kelime) eklensin mi?`)) return;
      busy = true;
      await db.importPresets(missing);
    } else {
      return;
    }
    cleanup();
    renderLibrary();
  }
}

function presetTile(preset, deck) {
  const sample = preset.words.slice(0, 4).map(([w]) => esc(w)).join(', ');
  return `
    <article class="deck-tile">
      <div>
        <h2 class="tile-title">${levelBadge(preset.level)} ${esc(preset.name)}</h2>
        <p class="muted small">${preset.words.length} kelime · ${sample}…</p>
      </div>
      <div class="tile-actions">
        ${deck
          ? `<span class="badge learned">✓ Eklendi</span>
             <a class="btn small" href="#/deck/${deck.id}">Desteye git</a>`
          : `<span></span>
             <button class="btn primary small" data-action="add" data-id="${preset.id}">Ekle</button>`}
      </div>
    </article>`;
}

// ---------------------------------------------------------------------------
// Progress / stats
// ---------------------------------------------------------------------------

async function renderStats() {
  const [decks, cards, activity, settings] = await Promise.all([
    db.getDecks(), db.getAllCards(), db.getActivity(), db.getSettings(),
  ]);
  const now = Date.now();
  const learned = cards.filter(isLearned).length;
  const due = cards.filter((c) => isDue(c, now)).length;
  const days = lastNDays(activity, 14, now);
  const maxCount = Math.max(1, ...days.map((d) => d.count));
  const todayKey = dateKey(now);

  const stat = (value, label) => `
    <div class="stat"><span class="stat-value">${value}</span><span class="stat-label">${label}</span></div>`;

  app.innerHTML = `
    <section class="page-head"><h1>İlerleme</h1></section>

    <div class="stats-grid">
      ${stat(`🔥 ${currentStreak(activity, now)}`, 'Günlük seri')}
      ${stat(longestStreak(activity), 'En uzun seri')}
      ${stat(activity[todayKey] || 0, 'Bugünkü tekrar')}
      ${stat(`${learned}<small>/${cards.length}</small>`, 'Öğrenilen kart')}
      ${stat(due, 'Tekrar bekleyen')}
      ${stat(decks.length, 'Deste')}
    </div>

    <h2 class="section-title">Son 14 gün</h2>
    <div class="activity">
      ${days.map((d) => `
        <div class="activity-day ${d.key === todayKey ? 'today' : ''}" title="${d.key}: ${d.count} tekrar">
          <span class="activity-count">${d.count || ''}</span>
          <div class="activity-bar"><span style="height:${(d.count / maxCount) * 100}%"></span></div>
          <span class="activity-label">${d.label}</span>
        </div>`).join('')}
    </div>

    <h2 class="section-title">Destelere göre</h2>
    ${decks.length ? `<ul class="deck-progress">
      ${decks.map((d) => {
        const dc = cards.filter((c) => c.deckId === d.id);
        const dl = dc.filter(isLearned).length;
        const pct = dc.length ? Math.round((dl / dc.length) * 100) : 0;
        return `
          <li>
            <a href="#/deck/${d.id}">${levelBadge(d.level)} ${esc(d.name)}</a>
            <div class="bar"><span style="width:${pct}%"></span></div>
            <span class="muted small">${dl}/${dc.length} · %${pct}</span>
          </li>`;
      }).join('')}
    </ul>` : '<p class="empty">Henüz deste yok.</p>'}

    <p class="muted small note">Bir kart üst üste ${LEARNED_BOX} kez bilindiğinde "öğrenildi" sayılır.</p>

    ${backupSection(settings.lastBackup, cards.length, now)}`;

  setupBackup(app.querySelector('.backup'));
}

// ---------------------------------------------------------------------------
// Backup: download all data as a file, or restore it from one
// ---------------------------------------------------------------------------

const BACKUP_REMIND_DAYS = 14;

function backupSection(lastBackup, cardCount, now) {
  const days = lastBackup ? Math.floor((now - lastBackup) / 86_400_000) : null;
  const when = days === null ? 'Henüz yedek almadın.'
    : days === 0 ? 'Son yedek: bugün'
    : days === 1 ? 'Son yedek: dün'
    : `Son yedek: ${days} gün önce`;
  const remind = cardCount > 0 && (days === null || days >= BACKUP_REMIND_DAYS);
  return `
    <h2 class="section-title">Yedekleme</h2>
    <div class="backup">
      <p class="muted">Kartların ve ilerlemen sadece bu tarayıcıda saklanıyor. Tarayıcı verilerini silersen
        ya da başka bir cihaza geçersen kaybolur. Ara sıra yedek alıp dosyayı güvenli bir yerde sakla.</p>
      <p class="${remind ? 'backup-remind' : 'muted small'}">${remind ? '⚠️ ' : ''}${when}</p>
      <div class="head-actions">
        <button class="btn primary" data-action="export">⬇️ Yedeği indir</button>
        <button class="btn" data-action="import">⬆️ Yedekten yükle</button>
        <input type="file" accept=".json,application/json" hidden>
      </div>
      <p class="backup-status" aria-live="polite"></p>
    </div>`;
}

function setupBackup(el) {
  const input = el.querySelector('input[type="file"]');
  el.addEventListener('click', async (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'import') input.click();
    if (action !== 'export') return;
    const backup = await db.exportBackup();
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `wordcards-yedek-${dateKey(Date.now())}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    await renderStats();
    backupStatus('Yedek indirildi. Dosyayı güvenli bir yere (ör. Google Drive) kaydet.', true);
  });

  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    let backup;
    try {
      backup = JSON.parse(await file.text());
    } catch {
      backupStatus('Dosya okunamadı. Bir WordCards yedeği (.json) seç.', false);
      return;
    }
    const cards = Array.isArray(backup?.data?.cards) ? backup.data.cards.length : 0;
    if (!confirm(`Şu anki bütün destelerin ve ilerlemen silinip yerine yedekteki ${cards} kart yüklenecek. Devam edilsin mi?`)) return;
    try {
      const result = await db.importBackup(backup);
      await renderStats();
      await updateNav(location.hash);
      backupStatus(`Yedek yüklendi: ${result.decks} deste, ${result.cards} kart.`, true);
    } catch (err) {
      backupStatus(err.message, false);
    }
  });
}

// Shows a message under the backup buttons (also after the page re-renders).
function backupStatus(text, ok) {
  const el = app.querySelector('.backup-status');
  if (el) el.innerHTML = `<span class="${ok ? 'ok' : 'bad'}">${esc(text)}</span>`;
}
