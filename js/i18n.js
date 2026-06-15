// js/i18n.js — t() engine for the public landing (PensoIA site).
// Codex-style i18n: every user-facing string lives in i18n/<lang>.js (all langs in sync).
// data-i18n -> textContent; data-i18n-html -> innerHTML (for strings carrying <span> markup).
import pt from '../i18n/pt.js?v=6';
import en from '../i18n/en.js?v=6';
import es from '../i18n/es.js?v=6';

const DICTS = { pt, en, es };
let active = 'pt';
const listeners = [];

export function t(key) { const d = DICTS[active] || {}; return key in d ? d[key] : key; }
export function languages() { return Object.keys(DICTS); }
export function getLang() { return active; }
export function setLang(l) { if (DICTS[l]) { active = l; listeners.forEach(fn => fn(active)); } }
export function onLang(fn) { listeners.push(fn); }

export function apply(root) {
  const r = root || document;
  r.querySelectorAll('[data-i18n]').forEach(el => {
    const v = t(el.getAttribute('data-i18n'));
    if (v != null) el.textContent = v;
  });
  r.querySelectorAll('[data-i18n-html]').forEach(el => {
    const v = t(el.getAttribute('data-i18n-html'));
    if (v != null) el.innerHTML = v;
  });
  document.documentElement.lang = active === 'pt' ? 'pt-BR' : active;
}
