import * as db from './storage.js';
import { review, isDue, isLearned, dueLabel, LEARNED_BOX } from './srs.js';
import { currentStreak, longestStreak, lastNDays, dateKey } from './stats.js';

const app = document.getElementById('app');

// Safely inserts user-entered text into HTML.
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Routing (#/ , #/deck/:id , #/study/:id[/all] , #/stats)
// ---------------------------------------------------------------------------

const routes = [
  [/^#\/?$/, renderHome],
  [/^#\/deck\/([\w-]+)$/, renderDeck],
  [/^#\/study\/([\w-]+)(?:\/(all))?$/, renderStudy],
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
  const section = hash.startsWith('#/stats') ? 'stats' : 'home';
  document.querySelectorAll('[data-nav]').forEach((a) =>
    a.classList.toggle('active', a.dataset.nav === section));
  const streak = currentStreak(await db.getActivity());
  document.getElementById('streak').textContent = streak ? `🔥 ${streak} gün` : '';
}

window.addEventListener('hashchange', router);
router();

function notFound() {
  app.innerHTML = `
    <p class="empty">Aradığın deste bulunamadı.</p>
    <p class="center"><a class="btn" href="#/">Destelere dön</a></p>`;
}

// ---------------------------------------------------------------------------
// Home: list of decks
// ---------------------------------------------------------------------------

async function renderHome() {
  const [decks, cards] = await Promise.all([db.getDecks(), db.getAllCards()]);
  const now = Date.now();

  app.innerHTML = `
    <section class="page-head"><h1>Destelerim</h1></section>
    <form class="inline-form" id="new-deck">
      <input name="deckName" placeholder="Yeni deste adı (örn. İngilizce Fiiller)" maxlength="60" required>
      <button class="btn primary">Deste oluştur</button>
    </form>
    ${decks.length
      ? `<div class="deck-grid">${decks
          .map((d) => deckTile(d, cards.filter((c) => c.deckId === d.id), now))
          .join('')}</div>`
      : `<p class="empty">Henüz bir desten yok. Yukarıdan ilk desteni oluştur.</p>`}`;

  app.querySelector('#new-deck').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = e.target.deckName.value.trim();
    if (!name) return;
    const deck = await db.createDeck(name);
    location.hash = `#/deck/${deck.id}`;
  });
}

function deckTile(deck, cards, now) {
  const due = cards.filter((c) => isDue(c, now)).length;
  const learned = cards.filter(isLearned).length;
  const pct = cards.length ? Math.round((learned / cards.length) * 100) : 0;
  return `
    <article class="deck-tile">
      <a href="#/deck/${deck.id}" class="deck-link">
        <h2>${esc(deck.name)}</h2>
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
    <a href="#/" class="back">← Desteler</a>
    <section class="page-head">
      <h1 id="deck-title">${esc(deck.name)}</h1>
      <div class="head-actions">
        ${studyBtn}
        <button class="btn" data-action="rename">Yeniden adlandır</button>
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
          location.hash = '#/';
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
        <button class="btn primary small">Kaydet</button>
      </form>`;
    const f = title.querySelector('form');
    f.deckName.select();
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = f.deckName.value.trim();
      if (!name) return;
      await db.renameDeck(id, name);
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
          <a class="btn" href="#/">Desteler</a>
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
// Progress / stats
// ---------------------------------------------------------------------------

async function renderStats() {
  const [decks, cards, activity] = await Promise.all([
    db.getDecks(), db.getAllCards(), db.getActivity(),
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
            <a href="#/deck/${d.id}">${esc(d.name)}</a>
            <div class="bar"><span style="width:${pct}%"></span></div>
            <span class="muted small">${dl}/${dc.length} · %${pct}</span>
          </li>`;
      }).join('')}
    </ul>` : '<p class="empty">Henüz deste yok.</p>'}

    <p class="muted small note">Bir kart üst üste ${LEARNED_BOX} kez bilindiğinde "öğrenildi" sayılır.</p>`;
}
