// Practice modes that reuse the user's cards: writing, listening, dictation
// and a matching game. They don't change the spaced repetition schedule; each answer
// only counts towards today's activity (and so the streak).

import * as db from './storage.js';
import { esc, shuffle } from './util.js';
import { canSpeak, speak } from './speech.js';

const ROUND = 10;
const PAIRS = 6;

export const MODES = {
  writing: { title: 'Yazma', intro: 'Türkçe anlamı gör, İngilizcesini yaz.', min: 1, run: writing },
  listening: { title: 'Dinleme', intro: 'Kelimeyi dinle, doğru anlamı seç.', min: 4, run: listening },
  dictation: { title: 'Dinleme', intro: 'Kelimeyi dinle, duyduğunu yaz.', min: 1, run: dictation },
  game: { title: 'Eşleştirme Oyunu', intro: 'Kelimeleri anlamlarıyla eşleştir; ne kadar hızlı, o kadar iyi.', min: PAIRS, run: game },
};

// Fronts of ready-made cards can look like "airplane / aeroplane" or
// "like (fiil)": the label is dropped and each variant is a valid answer.
const LABEL = /\s*\([^)]*\)\s*$/;
const normalize = (s) =>
  s.toLocaleLowerCase('en').replace(/[’`]/g, "'").replace(/[.!?,;:]+$/, '').replace(/\s+/g, ' ').trim();
const answers = (front) => front.replace(LABEL, '').split('/').map(normalize).filter(Boolean);
const spoken = (front) => front.replace(LABEL, '').split('/')[0].trim();

// Keeps one card per word and per meaning, so a question never has two right answers.
function distinct(cards) {
  const fronts = new Set();
  const backs = new Set();
  return cards.filter((c) => {
    const f = normalize(c.front);
    const b = normalize(c.back);
    if (fronts.has(f) || backs.has(b)) return false;
    fronts.add(f);
    backs.add(b);
    return true;
  });
}

// Renders a practice page into `root` and returns a cleanup function.
export async function renderPractice(root, mode) {
  const config = MODES[mode];
  const [decks, cards, settings] = await Promise.all([db.getDecks(), db.getAllCards(), db.getSettings()]);
  const deckId = decks.some((d) => d.id === settings.practiceDeck) ? settings.practiceDeck : '';
  const pool = distinct(shuffle(cards.filter((c) => !deckId || c.deckId === deckId)));

  root.innerHTML = `
    <a href="#/" class="back">← Ana sayfa</a>
    <section class="page-head">
      <h1>${config.title}</h1>
      <select id="practice-deck" aria-label="Hangi desteden">
        <option value="">Tüm destelerim</option>
        ${decks.map((d) => `
          <option value="${d.id}" ${d.id === deckId ? 'selected' : ''}>
            ${d.level ? `${esc(d.level)} · ` : ''}${esc(d.name)}
          </option>`).join('')}
      </select>
    </section>
    ${mode === 'listening' || mode === 'dictation' ? `
      <nav class="chips" aria-label="Dinleme türü">
        <a class="chip ${mode === 'listening' ? 'active' : ''}" href="#/practice/listening">Anlamını seç</a>
        <a class="chip ${mode === 'dictation' ? 'active' : ''}" href="#/practice/dictation">Duyduğunu yaz</a>
      </nav>` : ''}
    <p class="muted">${config.intro}</p>
    <div id="practice"></div>`;

  root.querySelector('#practice-deck').addEventListener('change', async (e) => {
    await db.saveSettings({ practiceDeck: e.target.value });
    // Re-run the router so the current view is torn down and rebuilt.
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });

  const el = root.querySelector('#practice');
  if ((mode === 'listening' || mode === 'dictation') && !canSpeak) {
    el.innerHTML = `<p class="empty">Tarayıcın sesli okumayı desteklemiyor. Chrome, Edge ya da Safari'yi dene.</p>`;
    return null;
  }
  if (pool.length < config.min) {
    el.innerHTML = `
      <p class="empty">Bu mod için en az ${config.min} farklı kelime gerekiyor${deckId ? ' (bu destede yeterli değil)' : ''}.</p>
      <p class="center"><a class="btn primary" href="#/library">Hazır deste ekle</a></p>`;
    return null;
  }
  return config.run(el, pool);
}

const progress = (done, total) => `
  <div class="study-head">
    <div class="bar"><span style="width:${(done / total) * 100}%"></span></div>
    <span class="muted small">${done} / ${total}</span>
  </div>`;

function result(emoji, title, text) {
  return `
    <div class="done">
      <div class="done-emoji">${emoji}</div>
      <h1>${title}</h1>
      <p class="muted">${text}</p>
      <div class="done-actions">
        <a class="btn" href="#/">Ana sayfa</a>
        <button class="btn primary" data-action="restart">Tekrar oyna</button>
      </div>
    </div>`;
}

// Compares what was typed with the closest right answer, letter by letter
// (longest common subsequence). Returns both strings as HTML: letters typed by
// mistake are marked in `typed`, letters that were missed in `expected`.
function diff(input, front) {
  const a = normalize(input);
  let best;
  for (const b of answers(front)) {
    const t = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
    for (let x = a.length - 1; x >= 0; x--) {
      for (let y = b.length - 1; y >= 0; y--) {
        t[x][y] = a[x] === b[y] ? t[x + 1][y + 1] + 1 : Math.max(t[x + 1][y], t[x][y + 1]);
      }
    }
    if (!best || t[0][0] > best.t[0][0]) best = { b, t };
  }
  const { b, t } = best;
  let typed = '';
  let expected = '';
  let x = 0;
  let y = 0;
  while (x < a.length || y < b.length) {
    if (x < a.length && y < b.length && a[x] === b[y]) {
      typed += esc(a[x++]);
      expected += esc(b[y++]);
    } else if (y < b.length && (x === a.length || t[x][y + 1] >= t[x + 1][y])) {
      expected += `<mark class="miss">${esc(b[y++])}</mark>`;
    } else {
      typed += `<mark class="extra">${esc(a[x++])}</mark>`;
    }
  }
  return { typed, expected };
}

const scoreEmoji = (score, total) => (score === total ? '🏆' : score >= total / 2 ? '👏' : '💪');

// Sets up click and keyboard handlers on `el` and returns their cleanup.
function listen(el, onClick, onKey) {
  el.addEventListener('click', onClick);
  if (onKey) document.addEventListener('keydown', onKey);
  return () => {
    el.removeEventListener('click', onClick);
    if (onKey) document.removeEventListener('keydown', onKey);
    if (canSpeak) speechSynthesis.cancel();
  };
}

// ---------------------------------------------------------------------------
// Writing: see the Turkish meaning, type the English word
// ---------------------------------------------------------------------------

function writing(el, pool) {
  let queue, i, score, checked;

  function start() {
    queue = shuffle([...pool]).slice(0, ROUND);
    i = 0;
    score = 0;
    show();
  }

  function show() {
    if (i >= queue.length) {
      el.innerHTML = result(scoreEmoji(score, queue.length), `${score} / ${queue.length}`,
        'Yanlış yazdığın kelimeleri destende tekrar çalışabilirsin.');
      return;
    }
    checked = false;
    el.innerHTML = `
      ${progress(i, queue.length)}
      <div class="prompt-card">
        <span class="hint">Türkçesi</span>
        <p class="prompt">${esc(queue[i].back)}</p>
      </div>
      <form class="answer-form" autocomplete="off">
        <input name="answer" placeholder="İngilizcesini yaz" autocapitalize="off" spellcheck="false" aria-label="Cevabın">
        <button class="btn primary">Kontrol et</button>
      </form>
      <div class="feedback" aria-live="polite"></div>
      <p class="center"><button type="button" class="btn small" data-action="hint">İpucu</button></p>`;
    el.querySelector('input').focus();
  }

  async function check() {
    const card = queue[i];
    const input = el.querySelector('input');
    if (!input.value.trim()) return;
    checked = true;
    const ok = answers(card.front).includes(normalize(input.value));
    if (ok) score++;
    input.readOnly = true;
    el.querySelector('.answer-form .btn').textContent = 'Devam →';
    el.querySelector('[data-action="hint"]').hidden = true;
    el.querySelector('.feedback').innerHTML = ok
      ? `<span class="ok">✓ Doğru!</span>`
      : `<span class="bad">✗ Doğru cevap: <strong>${esc(card.front)}</strong></span>`;
    speak(spoken(card.front));
    await db.logActivity();
  }

  function onSubmit(e) {
    e.preventDefault();
    if (!checked) check();
    else { i++; show(); }
  }

  function onClick(e) {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'restart') start();
    if (action === 'hint' && !checked) {
      const word = answers(queue[i].front)[0];
      el.querySelector('.feedback').innerHTML =
        `<span class="muted">İpucu: ${esc(word[0])}${' _'.repeat(word.length - 1)} (${word.length} harf)</span>`;
      el.querySelector('input').focus();
    }
  }

  el.addEventListener('submit', onSubmit);
  const stop = listen(el, onClick);
  start();
  return () => {
    el.removeEventListener('submit', onSubmit);
    stop();
  };
}

// ---------------------------------------------------------------------------
// Listening: hear the English word, pick its meaning
// ---------------------------------------------------------------------------

function listening(el, pool) {
  let queue, i, score, answered;

  function start() {
    queue = shuffle([...pool]).slice(0, ROUND);
    i = 0;
    score = 0;
    show();
  }

  function show() {
    if (i >= queue.length) {
      el.innerHTML = result(scoreEmoji(score, queue.length), `${score} / ${queue.length}`,
        'Dinleyerek tanıdığın kelimeler kalıcı olur.');
      return;
    }
    answered = false;
    const card = queue[i];
    const options = shuffle([card, ...shuffle(pool.filter((c) => c !== card)).slice(0, 3)]);
    el.innerHTML = `
      ${progress(i, queue.length)}
      <div class="prompt-card">
        <button class="btn primary big" data-action="speak">🔊 Tekrar dinle <kbd>Boşluk</kbd></button>
      </div>
      <div class="options">
        ${options.map((o, k) => `
          <button class="option" data-action="pick" data-id="${o.id}"><kbd>${k + 1}</kbd> ${esc(o.back)}</button>`).join('')}
      </div>
      <div class="feedback" aria-live="polite"></div>`;
    speak(spoken(card.front));
  }

  async function pick(id) {
    if (answered) return;
    answered = true;
    const card = queue[i];
    const ok = id === card.id;
    if (ok) score++;
    el.querySelectorAll('.option').forEach((b) => {
      b.disabled = true;
      if (b.dataset.id === card.id) b.classList.add('correct');
      else if (b.dataset.id === id) b.classList.add('wrong');
    });
    el.querySelector('.feedback').innerHTML = `
      <span class="${ok ? 'ok' : 'bad'}">${ok ? '✓' : '✗'} <strong>${esc(card.front)}</strong> = ${esc(card.back)}</span>
      <p><button class="btn primary" data-action="next">Devam → <kbd>Enter</kbd></button></p>`;
    el.querySelector('[data-action="next"]').focus();
    await db.logActivity();
  }

  function next() {
    if (!answered) return;
    i++;
    show();
  }

  function onClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'speak') speak(spoken(queue[i].front));
    else if (action === 'pick') pick(btn.dataset.id);
    else if (action === 'next') next();
    else if (action === 'restart') start();
  }

  function onKey(e) {
    if (i >= queue.length) return;
    if (e.key === ' ') {
      e.preventDefault();
      speak(spoken(queue[i].front));
    } else if (/^[1-4]$/.test(e.key)) {
      el.querySelectorAll('.option')[Number(e.key) - 1]?.click();
    } else if (e.key === 'Enter' && answered && !e.target.closest?.('button')) {
      next();
    }
  }

  start();
  return listen(el, onClick, onKey);
}

// ---------------------------------------------------------------------------
// Dictation: hear the English word, type what you heard
// ---------------------------------------------------------------------------

function dictation(el, pool) {
  let queue, i, score, checked;

  const say = (rate) => speak(spoken(queue[i].front), rate);

  function start() {
    queue = shuffle([...pool]).slice(0, ROUND);
    i = 0;
    score = 0;
    show();
  }

  function show() {
    if (i >= queue.length) {
      el.innerHTML = result(scoreEmoji(score, queue.length), `${score} / ${queue.length}`,
        'Duyduğunu yazmak hem kulağını hem yazımını geliştirir.');
      return;
    }
    checked = false;
    el.innerHTML = `
      ${progress(i, queue.length)}
      <div class="prompt-card">
        <button type="button" class="btn primary big" data-action="speak">🔊 Tekrar dinle <kbd>Esc</kbd></button>
        <button type="button" class="btn small" data-action="slow">🐢 Yavaş dinle</button>
      </div>
      <form class="answer-form" autocomplete="off">
        <input name="answer" placeholder="Duyduğunu yaz" autocapitalize="off" spellcheck="false" aria-label="Cevabın">
        <button class="btn primary">Kontrol et</button>
      </form>
      <div class="feedback" aria-live="polite"></div>`;
    el.querySelector('input').focus();
    say();
  }

  async function check() {
    const card = queue[i];
    const input = el.querySelector('input');
    if (!input.value.trim()) return;
    checked = true;
    const ok = answers(card.front).includes(normalize(input.value));
    if (ok) score++;
    input.readOnly = true;
    el.querySelector('.answer-form .btn').textContent = 'Devam →';
    const meaning = `<p class="muted">${esc(card.front)} = ${esc(card.back)}</p>`;
    if (ok) {
      el.querySelector('.feedback').innerHTML = `<span class="ok">✓ Doğru!</span>${meaning}`;
    } else {
      const { typed, expected } = diff(input.value, card.front);
      el.querySelector('.feedback').innerHTML = `
        <div class="dictation-diff">
          <span class="muted small">Senin yazdığın</span><span class="word">${typed}</span>
          <span class="muted small">Doğrusu</span><span class="word">${expected}</span>
        </div>
        ${meaning}`;
    }
    await db.logActivity();
  }

  function onSubmit(e) {
    e.preventDefault();
    if (!checked) check();
    else { i++; show(); }
  }

  function onClick(e) {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'restart') start();
    else if (action === 'speak' || action === 'slow') {
      say(action === 'slow' ? 0.6 : undefined);
      el.querySelector('input').focus();
    }
  }

  // Space is needed for typing phrases, so Escape replays the word instead.
  function onKey(e) {
    if (i < queue.length && e.key === 'Escape') say();
  }

  el.addEventListener('submit', onSubmit);
  const stop = listen(el, onClick, onKey);
  start();
  return () => {
    el.removeEventListener('submit', onSubmit);
    stop();
  };
}

// ---------------------------------------------------------------------------
// Matching game: pair each word with its meaning against the clock
// ---------------------------------------------------------------------------

function game(el, pool) {
  let cards, matched, mistakes, startedAt, timer, selected;

  function start() {
    clearInterval(timer);
    cards = shuffle([...pool]).slice(0, PAIRS);
    matched = 0;
    mistakes = 0;
    selected = {};
    startedAt = Date.now();
    const tile = (c, side) => `
      <button class="tile" data-side="${side}" data-id="${c.id}">${esc(side === 'front' ? c.front : c.back)}</button>`;
    el.innerHTML = `
      <div class="game-head">
        <span>⏱ <strong id="timer">0</strong> sn</span>
        <span>Hata: <strong id="mistakes">0</strong></span>
      </div>
      <div class="match">
        <div class="match-col">${shuffle([...cards]).map((c) => tile(c, 'front')).join('')}</div>
        <div class="match-col">${shuffle([...cards]).map((c) => tile(c, 'back')).join('')}</div>
      </div>`;
    timer = setInterval(() => {
      el.querySelector('#timer').textContent = Math.floor((Date.now() - startedAt) / 1000);
    }, 1000);
  }

  async function finish() {
    clearInterval(timer);
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    const { bestMatchTime } = await db.getSettings();
    const record = !mistakes && (!bestMatchTime || seconds < bestMatchTime);
    if (record) await db.saveSettings({ bestMatchTime: seconds });
    el.innerHTML = result(
      record ? '🏆' : mistakes ? '👏' : '🎉',
      `${seconds} saniye`,
      `${mistakes ? `${mistakes} hata` : 'Hatasız'}${record ? ' · Yeni rekor!' : bestMatchTime ? ` · Rekorun: ${bestMatchTime} sn (hatasız)` : ''}`,
    );
  }

  async function choose(btn) {
    if (btn.classList.contains('matched')) return;
    const side = btn.dataset.side;
    selected[side]?.classList.remove('selected');
    selected[side] = btn;
    btn.classList.add('selected');
    const { front, back } = selected;
    if (!front || !back) return;
    selected = {};
    if (front.dataset.id === back.dataset.id) {
      for (const b of [front, back]) {
        b.classList.replace('selected', 'matched');
        b.disabled = true;
      }
      speak(spoken(front.textContent));
      matched++;
      await db.logActivity();
      if (matched === cards.length) finish();
    } else {
      mistakes++;
      el.querySelector('#mistakes').textContent = mistakes;
      for (const b of [front, back]) {
        b.classList.replace('selected', 'wrong');
        setTimeout(() => b.classList.remove('wrong'), 500);
      }
    }
  }

  function onClick(e) {
    const btn = e.target.closest('.tile, [data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'restart') start();
    else if (btn.classList.contains('tile')) choose(btn);
  }

  start();
  const stop = listen(el, onClick);
  return () => {
    clearInterval(timer);
    stop();
  };
}
