'use strict';
// Codex i18n engine.
//
// t(key)  -> the displayed string for the active language, or the key itself
//            if missing (so an untranslated key is visible, not blank).
// apply() -> fills every [data-i18n] element's textContent, and every
//            [data-i18n-attr="attr:key,attr:key"] element's attributes.
//
// Single active language for now (PT-BR). languages() returns every loaded
// dictionary; the language selector should render only when there is more
// than one, so it stays hidden until a second dictionary file is added.
//
// Assumed globals: CODEX_I18N (populated by i18n/<lang>.js files loaded first).
window.I18N = (function() {
  var DEFAULT = 'pt-BR';
  var dicts = window.CODEX_I18N || {};
  var active = DEFAULT;

  function t(key) {
    var d = dicts[active] || {};
    return Object.prototype.hasOwnProperty.call(d, key) ? d[key] : key;
  }

  function languages() { return Object.keys(dicts); }

  function setLang(lang) {
    if (dicts[lang]) { active = lang; }
    return active;
  }

  function apply(root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach(function(el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    root.querySelectorAll('[data-i18n-attr]').forEach(function(el) {
      el.getAttribute('data-i18n-attr').split(',').forEach(function(pair) {
        var kv = pair.split(':');
        if (kv.length === 2) { el.setAttribute(kv[0].trim(), t(kv[1].trim())); }
      });
    });
  }

  return { t: t, apply: apply, setLang: setLang, languages: languages, DEFAULT: DEFAULT };
})();

// Convenience global so call sites read t('key') like the rest of Backstage.
window.t = window.I18N.t;
