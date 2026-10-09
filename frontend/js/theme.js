// Light / dark theme picker in the top bar.
// The choice is a per-device preference, so it is kept in its own localStorage
// key instead of storage.js: it isn't part of the backup, and index.html has to
// read it before the first paint to avoid a flash of the wrong theme.

const KEY = 'wordcards:theme';

const THEMES = [
  { id: 'system', icon: '🖥️', label: 'Sistem' },
  { id: 'light', icon: '☀️', label: 'Açık' },
  { id: 'dark', icon: '🌙', label: 'Koyu' },
];

function saved() {
  try {
    const id = localStorage.getItem(KEY);
    return THEMES.find((t) => t.id === id) ?? THEMES[0];
  } catch {
    return THEMES[0];
  }
}

function apply(theme) {
  if (theme.id === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme.id;
}

function show(button, theme) {
  button.textContent = theme.icon;
  button.title = `Tema: ${theme.label}`;
  button.setAttribute('aria-label', `Tema: ${theme.label}. Değiştirmek için tıkla`);
}

export function initThemeToggle(button) {
  let theme = saved();
  show(button, theme);
  button.addEventListener('click', () => {
    const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    try {
      if (next.id === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next.id);
    } catch { /* storage blocked: the theme still changes for this visit */ }
    theme = next;
    apply(theme);
    show(button, theme);
  });
}
