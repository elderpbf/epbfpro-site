// js/theme.js — light/dark theme bus for the landing (persists to localStorage.plp_theme).
const KEY = 'plp_theme';
let theme = localStorage.getItem(KEY) || 'dark';
const listeners = [];

export function getTheme() { return theme; }
export function onTheme(fn) { listeners.push(fn); }
export function setTheme(t) {
  theme = t;
  try { localStorage.setItem(KEY, t); } catch (e) {}
  document.documentElement.dataset.theme = t;
  listeners.forEach(fn => fn(theme));
}
export function toggleTheme() { setTheme(theme === 'dark' ? 'light' : 'dark'); }
export function initTheme() { document.documentElement.dataset.theme = theme; }
