// Codex i18n engine.
//
// t(key)        -> displayed string for the active language, or the key itself
//                  if missing (so an untranslated key is visible, not blank).
// apply(root)   -> fills [data-i18n] textContent and [data-i18n-attr] attrs.
// languages()   -> loaded dictionary codes; render a selector only when > 1.
//
// PT-BR is the active language; EN ships alongside, one setLang() away.
import pt from '../i18n/pt.js';
import en from '../i18n/en.js';

const DICTS = { 'pt-BR': pt, 'en': en };
let active = 'pt-BR';

export function t(key) {
  const d = DICTS[active] || {};
  return Object.prototype.hasOwnProperty.call(d, key) ? d[key] : key;
}

export function languages() { return Object.keys(DICTS); }

export function setLang(lang) { if (DICTS[lang]) active = lang; return active; }

export function apply(root) {
  root = root || document;
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    el.getAttribute('data-i18n-attr').split(',').forEach((pair) => {
      const kv = pair.split(':');
      if (kv.length === 2) el.setAttribute(kv[0].trim(), t(kv[1].trim()));
    });
  });
}
