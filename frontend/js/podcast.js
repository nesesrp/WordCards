// Podcast: short hand-written episodes in which two hosts talk, read aloud with
// two browser voices. The transcript starts hidden, its words can be looked up
// like on the reading page, and each episode ends with comprehension questions.

import * as db from './storage.js';
import { esc, shuffle } from './util.js';
import { LEVELS, levelName } from './presets.js';
import { canSpeak, speakLines, stopSpeaking } from './speech.js';
import { attachWordSheet, wordsHtml } from './wordsheet.js';

const PODCAST_DECK = 'Podcast Kelimeleri';
const BASE_RATE = 0.9; // the "1x" speed, same as everywhere else in the app
const SPEEDS = [0.75, 1, 1.25];
const WORDS_PER_MINUTE = 140;

let data = null;

async function loadEpisodes() {
  data ??= fetch('data/podcasts.json')
    .then((res) => {
      if (!res.ok) throw new Error(`podcasts.json: HTTP ${res.status}`);
      return res.json();
    })
    .catch((err) => {
      data = null; // allow a retry on the next visit
      throw err;
    });
  return data;
}

const levelBadge = (level) =>
  `<span class="badge level" title="${esc(levelName(level))}">${esc(level)}</span>`;

const minutes = (episode) => Math.max(1, Math.round(
  episode.lines.reduce((n, [, text]) => n + text.split(/\s+/).length, 0) / WORDS_PER_MINUTE));

const note = `
  <p class="muted small note">
    Bölümler WordCards için yazıldı. Sesler tarayıcının sesli okuma özelliğinden gelir,
    bu yüzden tarayıcıya ve cihaza göre değişir.
  </p>`;

// ---------------------------------------------------------------------------
// List of episodes
// ---------------------------------------------------------------------------

// Level filter on the list; kept while the app is open.
let listLevel = '';

export async function renderPodcastList(root) {
  let podcast;
  try {
    podcast = await loadEpisodes();
  } catch {
    root.innerHTML = `
      <section class="page-head"><h1>Podcast</h1></section>
      <p class="empty">Bölümler yüklenemedi. Sayfayı yenileyip tekrar dene.</p>`;
    return null;
  }
  const progress = (await db.getSettings()).podcasts ?? {};
  const levels = LEVELS.filter((l) => podcast.episodes.some((e) => e.level === l.id));

  root.innerHTML = `
    <a href="#/" class="back">← Ana sayfa</a>
    <section class="page-head"><h1>Podcast</h1></section>
    <p class="muted">${esc(podcast.hosts.join(' ve '))} her bölümde bir konu üzerine sohbet ediyor. Önce dinle, sonra soruları cevapla.</p>
    <div class="chips" role="tablist" aria-label="Seviye">
      <button class="chip ${listLevel ? '' : 'active'}" data-level="">Tümü</button>
      ${levels.map((l) => `
        <button class="chip ${l.id === listLevel ? 'active' : ''}" data-level="${l.id}" title="${l.name}">${l.id}</button>`).join('')}
    </div>
    <div class="deck-grid text-grid"></div>
    ${note}`;

  const grid = root.querySelector('.text-grid');
  function renderGrid() {
    grid.innerHTML = podcast.episodes.filter((e) => !listLevel || e.level === listLevel).map((e) => {
      const p = progress[e.id];
      return `
        <a class="deck-tile text-tile" href="#/podcast/${e.id}">
          <h2 class="tile-title">${p?.listened ? '<span class="read-mark" title="Dinledin">✓</span> ' : ''}${esc(e.title)}</h2>
          <p class="muted small">${esc(e.summary)}</p>
          <p class="text-meta">
            ${levelBadge(e.level)}
            <span class="muted small">~${minutes(e)} dk${p?.score != null ? ` · Sorular: ${p.score}/${p.total}` : ''}</span>
          </p>
        </a>`;
    }).join('');
  }
  renderGrid();

  root.querySelector('.chips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-level]');
    if (!chip) return;
    listLevel = chip.dataset.level;
    root.querySelectorAll('.chips .chip').forEach((c) => c.classList.toggle('active', c === chip));
    renderGrid();
  });
  return null;
}

// ---------------------------------------------------------------------------
// Episode: player, transcript and questions
// ---------------------------------------------------------------------------

export async function renderEpisode(root, id) {
  let podcast;
  try {
    podcast = await loadEpisodes();
  } catch {
    podcast = null;
  }
  const index = podcast?.episodes.findIndex((e) => e.id === id) ?? -1;
  if (index < 0) {
    root.innerHTML = `
      <a href="#/podcast" class="back">← Podcast</a>
      <p class="empty">Bu bölüm bulunamadı.</p>`;
    return null;
  }
  const episode = podcast.episodes[index];
  const next = podcast.episodes[index + 1];
  const lines = episode.lines.map(([host, text]) => ({ host, text }));
  const settings = await db.getSettings();
  let speed = SPEEDS.includes(settings.podcastSpeed) ? settings.podcastSpeed : 1;
  let showTranscript = !canSpeak || Boolean(settings.podcastTranscript);

  root.innerHTML = `
    <a href="#/podcast" class="back">← Podcast</a>
    <section class="page-head">
      <h1>${esc(episode.title)}</h1>
      ${levelBadge(episode.level)}
    </section>
    <p class="muted">${esc(episode.summary)}</p>
    ${canSpeak ? `
      <div class="player">
        <div class="player-main">
          <button class="icon-btn" data-action="back" aria-label="Önceki cümle" title="Önceki cümle">⏮</button>
          <button class="btn primary big" data-action="play">▶ Dinle</button>
          <button class="icon-btn" data-action="forward" aria-label="Sonraki cümle" title="Sonraki cümle">⏭</button>
        </div>
        <div class="player-progress">
          <div class="bar"><span></span></div>
          <span class="muted small" data-progress></span>
        </div>
        <div class="player-options">
          <div class="chips" role="group" aria-label="Hız">
            ${SPEEDS.map((s) => `
              <button class="chip ${s === speed ? 'active' : ''}" data-speed="${s}">${s}x</button>`).join('')}
          </div>
          <button class="btn small" data-action="transcript"></button>
        </div>
      </div>` : '<p class="empty">Tarayıcın sesli okumayı desteklemiyor, ama metni okuyup soruları cevaplayabilirsin.</p>'}
    <p class="muted small reader-tip" data-tip>Bilmediğin kelimeye dokun. Bir konuşmacının adına dokunursan oradan dinlersin.</p>
    <article class="reader transcript" lang="en">
      ${lines.map((l, i) => `
        <p class="line" data-i="${i}">
          <button class="line-host host-${l.host % 2}" data-action="from" data-i="${i}" title="Buradan dinle">${esc(podcast.hosts[l.host] ?? '')}</button>
          <span class="line-text">${wordsHtml(l.text)}</span>
        </p>`).join('')}
    </article>
    <section class="quiz">
      <h2 class="section-title">Anlama soruları</h2>
      <div class="quiz-body"></div>
    </section>
    <div class="reader-end">
      ${next ? `<a class="btn" href="#/podcast/${next.id}">Sonraki bölüm →</a>` : '<a class="btn" href="#/podcast">Tüm bölümler</a>'}
    </div>
    ${note}`;

  const transcript = root.querySelector('.transcript');
  const detachSheet = await attachWordSheet(root, transcript, { deckName: PODCAST_DECK, settingsKey: 'podcastDeck' });

  async function saveProgress(fields) {
    const podcasts = { ...((await db.getSettings()).podcasts ?? {}) };
    podcasts[id] = { ...podcasts[id], ...fields };
    await db.saveSettings({ podcasts });
  }

  // --- Transcript ---

  const transcriptBtn = root.querySelector('[data-action="transcript"]');
  function renderTranscript() {
    transcript.hidden = !showTranscript;
    root.querySelector('[data-tip]').hidden = !showTranscript;
    if (transcriptBtn) transcriptBtn.textContent = showTranscript ? '📝 Metni gizle' : '📝 Metni göster';
  }
  renderTranscript();

  // --- Player ---

  let playing = false;
  let current = 0; // the line being read, or the one to start from

  const playBtn = root.querySelector('[data-action="play"]');
  function renderPlayer() {
    if (!playBtn) return;
    playBtn.textContent = playing ? '⏸ Durdur' : current > 0 ? '▶ Devam et' : '▶ Dinle';
    root.querySelector('.player .bar span').style.width = `${(current / lines.length) * 100}%`;
    root.querySelector('[data-progress]').textContent =
      `${playing || current > 0 ? current + 1 : 0} / ${lines.length} cümle`;
    transcript.querySelector('.speaking')?.classList.remove('speaking');
    if (playing) {
      const line = transcript.querySelector(`.line[data-i="${current}"]`);
      line.classList.add('speaking');
      if (showTranscript) line.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function play(from = current) {
    // Starting a new queue ends the old one first (its onEnd(false) runs now),
    // so the state is set after speakLines().
    from = Math.max(0, Math.min(from, lines.length - 1));
    speakLines(lines, {
      start: from,
      rate: BASE_RATE * speed,
      onLine(i) {
        current = i;
        renderPlayer();
      },
      onEnd(finished) {
        playing = false;
        if (finished) {
          current = 0;
          finishListening();
        }
        renderPlayer();
      },
    });
    current = from;
    playing = true;
    renderPlayer();
  }

  function pause() {
    stopSpeaking(); // calls onEnd(false), which updates the player
  }

  async function finishListening() {
    if (settings.podcasts?.[id]?.listened) return;
    settings.podcasts = { ...settings.podcasts, [id]: { ...settings.podcasts?.[id], listened: true } };
    await saveProgress({ listened: true });
    await db.logActivity();
  }

  // --- Questions ---

  const quiz = root.querySelector('.quiz-body');
  let answers = [];

  function renderQuiz() {
    answers = episode.questions.map(() => null);
    quiz.innerHTML = `
      <ol class="questions">
        ${episode.questions.map((q, n) => `
          <li class="question" data-q="${n}">
            <p lang="en">${esc(q.q)}</p>
            <div class="options">
              ${shuffle(q.options.map((text, o) => ({ text, o }))).map(({ text, o }) => `
                <button class="option" data-action="answer" data-q="${n}" data-o="${o}" lang="en">${esc(text)}</button>`).join('')}
            </div>
          </li>`).join('')}
      </ol>
      <div class="quiz-result" aria-live="polite"></div>`;
  }

  async function answer(n, o) {
    if (answers[n] !== null) return;
    answers[n] = o;
    const right = episode.questions[n].answer;
    quiz.querySelectorAll(`.option[data-q="${n}"]`).forEach((b) => {
      b.disabled = true;
      const k = Number(b.dataset.o);
      if (k === right) b.classList.add('correct');
      else if (k === o) b.classList.add('wrong');
    });
    if (answers.includes(null)) return;

    const total = answers.length;
    const score = answers.filter((a, k) => a === episode.questions[k].answer).length;
    const emoji = score === total ? '🎉' : score >= total / 2 ? '👍' : '💪';
    quiz.querySelector('.quiz-result').innerHTML = `
      <div class="done">
        <div class="done-emoji">${emoji}</div>
        <h2>${score} / ${total}</h2>
        <p class="muted">${score === total ? 'Hepsini doğru anladın!' : 'Yanlış cevapladığın kısımları tekrar dinleyebilirsin.'}</p>
        <div class="done-actions">
          <button class="btn" data-action="retry">Tekrar çöz</button>
        </div>
      </div>`;
    await saveProgress({ score, total });
    await db.logActivity();
  }

  renderQuiz();
  renderPlayer();

  // --- Events ---

  async function onClick(e) {
    const btn = e.target.closest('[data-action], [data-speed]');
    if (!btn) return;
    if (btn.dataset.speed) {
      speed = Number(btn.dataset.speed);
      root.querySelectorAll('[data-speed]').forEach((c) => c.classList.toggle('active', c === btn));
      await db.saveSettings({ podcastSpeed: speed });
      if (playing) play(current); // restart the current line at the new speed
      return;
    }
    const action = btn.dataset.action;
    if (action === 'play') playing ? pause() : play();
    else if (action === 'back') play(current - 1);
    else if (action === 'forward') {
      if (current < lines.length - 1) play(current + 1);
    } else if (action === 'from') {
      if (canSpeak) play(Number(btn.dataset.i));
    } else if (action === 'transcript') {
      showTranscript = !showTranscript;
      renderTranscript();
      await db.saveSettings({ podcastTranscript: showTranscript });
    } else if (action === 'answer') answer(Number(btn.dataset.q), Number(btn.dataset.o));
    else if (action === 'retry') renderQuiz();
  }

  function onKey(e) {
    if (e.key !== ' ' || !canSpeak || e.target.closest('input, textarea, button, a')) return;
    e.preventDefault();
    playing ? pause() : play();
  }

  root.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);
  return () => {
    root.removeEventListener('click', onClick);
    document.removeEventListener('keydown', onKey);
    detachSheet();
    stopSpeaking();
  };
}
