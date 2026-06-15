/*
 * PensoIA - LGPD cookie consent (task 2C)
 * Self-contained classic script: injects its own styles + banner DOM and
 * exposes a tiny window.psoConsent API so future analytics (task 5B) only
 * load AFTER the visitor opts in. No third-party dependency.
 *
 * NOTE: written as a classic IIFE to match the current site (brand.js / main.js).
 * When the site is rebuilt to the Codex ES-module standard, this becomes an
 * ES module (consent.js exporting init()) alongside the rest.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'pso_consent';
  var CURRENT_VERSION = 1; // bump to re-prompt everyone if the policy materially changes

  var I18N = {
    'pt-BR': {
      title: 'Privacidade e cookies',
      body: 'Usamos armazenamento local apenas para lembrar suas preferências (tema e idioma). Métricas de uso só são ativadas com o seu consentimento. Saiba mais na nossa ',
      policy: 'Política de Privacidade',
      acceptAll: 'Aceitar todos',
      necessaryOnly: 'Apenas necessários',
      prefs: 'Preferências',
      save: 'Salvar escolhas',
      catNecessaryLabel: 'Necessários',
      catNecessaryDesc: 'Essenciais para o funcionamento do site (tema, idioma). Sempre ativos.',
      catAnalyticsLabel: 'Métricas de uso',
      catAnalyticsDesc: 'Ajudam a entender como o site é utilizado. Opcional.',
      always: 'Sempre ativo'
    },
    'en': {
      title: 'Privacy and cookies',
      body: 'We use local storage only to remember your preferences (theme and language). Usage analytics are enabled only with your consent. Learn more in our ',
      policy: 'Privacy Policy',
      acceptAll: 'Accept all',
      necessaryOnly: 'Necessary only',
      prefs: 'Preferences',
      save: 'Save choices',
      catNecessaryLabel: 'Necessary',
      catNecessaryDesc: 'Essential for the site to work (theme, language). Always on.',
      catAnalyticsLabel: 'Usage analytics',
      catAnalyticsDesc: 'Help us understand how the site is used. Optional.',
      always: 'Always on'
    }
  };

  var listeners = [];

  function lang() {
    var l = localStorage.getItem('language') || 'pt-BR';
    return I18N[l] ? l : 'pt-BR';
  }

  function policyHref() {
    // privacy.html is at the site root; works from / and from sub-pages at root.
    return 'privacy.html';
  }

  function read() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.v !== CURRENT_VERSION) return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function write(analytics) {
    var record = { v: CURRENT_VERSION, necessary: true, analytics: !!analytics, ts: new Date().toISOString() };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(record)); } catch (e) {}
    listeners.forEach(function (fn) { try { fn(record); } catch (e) {} });
    return record;
  }

  function injectStyles() {
    if (document.getElementById('pso-consent-style')) return;
    var css = ''
      + '.pso-consent{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9998;'
      + 'width:min(560px,calc(100vw - 32px));background:var(--surface,#fff);color:var(--text-primary,#134e4a);'
      + 'border:1px solid var(--accent,#7de8d6);border-radius:16px;box-shadow:0 18px 50px rgba(6,26,81,.18);'
      + 'padding:20px 22px;font-family:"Inter","Segoe UI",sans-serif;line-height:1.55;animation:pso-rise .35s ease-out both;}'
      + '@keyframes pso-rise{from{opacity:0;transform:translate(-50%,16px)}to{opacity:1;transform:translate(-50%,0)}}'
      + '.pso-consent h2{font-size:1rem;margin:0 0 6px;font-weight:700;}'
      + '.pso-consent p{font-size:.86rem;margin:0 0 14px;color:var(--text-secondary,#115e59);}'
      + '.pso-consent a{color:var(--primary,#14b8a6);font-weight:600;text-decoration:underline;}'
      + '.pso-consent .pso-actions{display:flex;flex-wrap:wrap;gap:10px;}'
      + '.pso-consent button{font-family:inherit;font-size:.84rem;font-weight:600;border-radius:10px;'
      + 'padding:10px 16px;cursor:pointer;border:1px solid var(--accent,#7de8d6);transition:transform .12s ease,filter .12s ease;}'
      + '.pso-consent button:hover{transform:translateY(-1px);filter:brightness(.98);}'
      + '.pso-consent button:focus-visible{outline:3px solid var(--primary,#14b8a6);outline-offset:2px;}'
      + '.pso-consent .pso-primary{background:var(--primary,#14b8a6);color:#042b27;border-color:var(--primary,#14b8a6);}'
      + '.pso-consent .pso-ghost{background:transparent;color:var(--text-primary,#134e4a);}'
      + '.pso-consent .pso-prefs{margin:4px 0 14px;display:none;}'
      + '.pso-consent .pso-prefs.open{display:block;}'
      + '.pso-consent .pso-cat{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;'
      + 'padding:10px 0;border-top:1px solid var(--accent,#7de8d6);}'
      + '.pso-consent .pso-cat .pso-cat-label{font-weight:600;font-size:.84rem;}'
      + '.pso-consent .pso-cat .pso-cat-desc{font-size:.76rem;color:var(--text-secondary,#115e59);margin-top:2px;}'
      + '.pso-consent .pso-cat .pso-always{font-size:.74rem;color:var(--text-secondary,#115e59);white-space:nowrap;padding-top:2px;}'
      + '.pso-consent input[type=checkbox]{width:18px;height:18px;accent-color:var(--primary,#14b8a6);margin-top:2px;}'
      + '@media (max-width:480px){.pso-consent .pso-actions button{flex:1 1 100%;}}'
      + '@media (prefers-reduced-motion: reduce){.pso-consent{animation:none;}}';
    var style = document.createElement('style');
    style.id = 'pso-consent-style';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function render() {
    var t = I18N[lang()];
    injectStyles();

    var el = document.createElement('aside');
    el.className = 'pso-consent';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-label', t.title);

    el.innerHTML =
      '<h2>' + t.title + '</h2>' +
      '<p>' + t.body + '<a href="' + policyHref() + '">' + t.policy + '</a>.</p>' +
      '<div class="pso-prefs" id="pso-prefs">' +
        '<div class="pso-cat">' +
          '<div><div class="pso-cat-label">' + t.catNecessaryLabel + '</div>' +
          '<div class="pso-cat-desc">' + t.catNecessaryDesc + '</div></div>' +
          '<span class="pso-always">' + t.always + '</span>' +
        '</div>' +
        '<div class="pso-cat">' +
          '<div><div class="pso-cat-label">' + t.catAnalyticsLabel + '</div>' +
          '<div class="pso-cat-desc">' + t.catAnalyticsDesc + '</div></div>' +
          '<input type="checkbox" id="pso-analytics" aria-label="' + t.catAnalyticsLabel + '">' +
        '</div>' +
      '</div>' +
      '<div class="pso-actions">' +
        '<button class="pso-primary" id="pso-accept">' + t.acceptAll + '</button>' +
        '<button class="pso-ghost" id="pso-necessary">' + t.necessaryOnly + '</button>' +
        '<button class="pso-ghost" id="pso-toggle-prefs">' + t.prefs + '</button>' +
        '<button class="pso-ghost" id="pso-save" style="display:none">' + t.save + '</button>' +
      '</div>';

    document.body.appendChild(el);

    function close() { el.remove(); }

    el.querySelector('#pso-accept').addEventListener('click', function () { write(true); close(); });
    el.querySelector('#pso-necessary').addEventListener('click', function () { write(false); close(); });
    el.querySelector('#pso-toggle-prefs').addEventListener('click', function () {
      var prefs = el.querySelector('#pso-prefs');
      var save = el.querySelector('#pso-save');
      var open = prefs.classList.toggle('open');
      save.style.display = open ? '' : 'none';
    });
    el.querySelector('#pso-save').addEventListener('click', function () {
      write(el.querySelector('#pso-analytics').checked); close();
    });
  }

  // Public API: future analytics gate on window.psoConsent.has('analytics').
  window.psoConsent = {
    get: read,
    has: function (category) {
      var r = read();
      if (!r) return false;
      if (category === 'necessary') return true;
      return !!r[category];
    },
    onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
    reopen: function () { if (!document.querySelector('.pso-consent')) render(); }
  };

  function boot() { if (!read()) render(); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
