// js/i18n.js — Greenroom i18n engine. Same shape as Codex's, extended for the
// four attribute forms the mock's markup uses (text, html, placeholder, title).
//
//   t(key)       -> string for the active language, or the key itself if missing
//                   (an untranslated key is visible, not blank).
//   apply(root)  -> fill [data-i18n] / [data-i18n-html] / [data-i18n-ph] / [data-i18n-title].
//   toggle()     -> flip PT <-> EN (persisted to gr_lang); returns the new lang.
//   current()    -> active lang code ('pt' | 'en').
//
// English internal keys; PT-BR active by default, EN ships alongside.
import pt from '../i18n/pt.js';
import en from '../i18n/en.js';

const DICTS = { pt, en };
const LANG_KEY = 'gr_lang';

let active = 'pt';
try {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved && DICTS[saved]) active = saved;
} catch (_) {}

export function current() { return active; }

export function t(key) {
  const d = DICTS[active] || {};
  return Object.prototype.hasOwnProperty.call(d, key) ? d[key] : key;
}

export function setLang(lang) {
  if (DICTS[lang]) {
    active = lang;
    try { localStorage.setItem(LANG_KEY, lang); } catch (_) {}
  }
  return active;
}

export function toggle() { return setLang(active === 'pt' ? 'en' : 'pt'); }

export function apply(root) {
  root = root || document;
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.getAttribute('data-i18n')); });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.getAttribute('data-i18n-html')); });
  root.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph'))); });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.setAttribute('title', t(el.getAttribute('data-i18n-title'))); });
  document.documentElement.setAttribute('lang', active === 'pt' ? 'pt-BR' : 'en');
}
