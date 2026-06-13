// js/theme.js — Greenroom's own theming (independent of Backstage). Five themes,
// Mint ("menta") default, persisted to localStorage gr_theme. Theme names are
// language-aware, so app.js rebuilds the menu on a language toggle.
import { current as curLang } from './i18n.js';

const THEME_KEY = 'gr_theme';

export const THEMES = [
  { id: 'light',    name: { pt: 'Claro',      en: 'Light' },    sw: 'linear-gradient(135deg,#ffffff 0 50%,#14b8a6 50%)' },
  { id: 'menta',    name: { pt: 'Menta',      en: 'Mint' },     sw: 'linear-gradient(135deg,#dff3ec 0 50%,#0d9488 50%)' },
  { id: 'areia',    name: { pt: 'Areia',      en: 'Sand' },     sw: 'linear-gradient(135deg,#f0e9dd 0 50%,#0d9488 50%)' },
  { id: 'dark',     name: { pt: 'Escuro',     en: 'Dark' },     sw: 'linear-gradient(135deg,#1a1f26 0 50%,#2bb7a6 50%)' },
  { id: 'midnight', name: { pt: 'Meia-noite', en: 'Midnight' }, sw: 'linear-gradient(135deg,#0a1020 0 50%,#2dd4bf 50%)' },
];

function cur() { return document.documentElement.getAttribute('data-theme') || 'menta'; }

export function buildMenu() {
  const m = document.getElementById('thmenu');
  if (!m) return;
  const lang = curLang(), active = cur();
  m.innerHTML = THEMES.map((th) =>
    '<div class="thi' + (th.id === active ? ' active' : '') + '" data-theme-id="' + th.id + '">' +
      '<span class="thsw" style="background:' + th.sw + '"></span>' +
      '<span class="thname">' + th.name[lang] + '</span>' +
      '<span class="ck"><svg class="g sm" viewBox="0 0 24 24"><path d="M5 12l5 5L20 7"/></svg></span>' +
    '</div>'
  ).join('');
}

export function setTheme(id) {
  document.documentElement.setAttribute('data-theme', id);
  try { localStorage.setItem(THEME_KEY, id); } catch (_) {}
  buildMenu();
  const m = document.getElementById('thmenu');
  if (m) m.classList.remove('on');
}

export function initTheme() {
  // Restore a persisted choice; the HTML default (menta) covers first visits.
  try { const s = localStorage.getItem(THEME_KEY); if (s) document.documentElement.setAttribute('data-theme', s); } catch (_) {}
  buildMenu();

  const btn = document.getElementById('themeBtn');
  if (btn) btn.addEventListener('click', (e) => {
    e.stopPropagation();
    buildMenu();
    const m = document.getElementById('thmenu');
    if (m) m.classList.toggle('on');
  });

  document.addEventListener('click', (e) => {
    const item = e.target.closest('.thi[data-theme-id]');
    if (item) { setTheme(item.getAttribute('data-theme-id')); return; }
    // Click outside the picker closes it.
    const w = document.querySelector('.thwrap'), m = document.getElementById('thmenu');
    if (m && w && !w.contains(e.target)) m.classList.remove('on');
  });
}
