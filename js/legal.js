// js/legal.js — shared chrome for the legal / policy pages (terms, privacy, suporte,
// extrator-pdf/privacidade). ONE implementation so every legal page behaves the same:
//   • Theme: defaults to the OS, but a manual toggle (#legalTheme) sticks in localStorage
//     'legal_theme' (Élder 2026-07-08: a manual choice must persist across the pages).
//   • Logo: swaps with the theme (navy wordmark = white text for dark bg; transp = navy
//     text for light bg), so it never renders white-on-white in light mode.
//   • Lang: optional PT/EN toggle (#langToggle + [data-lang-block] blocks), when present.
//   • Year: fills #currentYear.
(function () {
  var root = document.documentElement;
  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  var LOGO_DARK  = '/images/brand/glyph-wordmark_bg.navy.svg';   // white wordmark, for dark bg
  var LOGO_LIGHT = '/images/brand/glyph-wordmark_bg.transp.svg'; // navy wordmark, for light bg

  function themeStored() { try { return localStorage.getItem('legal_theme'); } catch (_) { return null; } }
  function applyTheme(t) {
    root.setAttribute('data-theme', t);
    var tg = document.getElementById('legalTheme');
    if (tg) tg.textContent = t === 'dark' ? '☀' : '☾';
    var imgs = document.querySelectorAll('.legal-logo img');
    for (var i = 0; i < imgs.length; i++) imgs[i].src = (t === 'dark') ? LOGO_DARK : LOGO_LIGHT;
  }
  applyTheme(themeStored() || (mq.matches ? 'dark' : 'light'));
  mq.addEventListener('change', function (e) { if (!themeStored()) applyTheme(e.matches ? 'dark' : 'light'); });

  var toggle = document.getElementById('legalTheme');
  if (toggle) toggle.addEventListener('click', function () {
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('legal_theme', next); } catch (_) {}
    applyTheme(next);
  });

  // Optional PT/EN toggle (only on pages that ship the bilingual blocks).
  var langBtn = document.getElementById('langToggle');
  var blocks = document.querySelectorAll('[data-lang-block]');
  if (langBtn && blocks.length) {
    var cur = (function () { try { return localStorage.getItem('language'); } catch (_) { return null; } })() || 'pt-BR';
    var applyLang = function (l) {
      root.setAttribute('lang', l);
      for (var i = 0; i < blocks.length; i++) blocks[i].classList.toggle('active', blocks[i].getAttribute('data-lang-block') === l);
      langBtn.textContent = l === 'pt-BR' ? 'EN' : 'PT';
    };
    applyLang(cur);
    langBtn.addEventListener('click', function () {
      cur = cur === 'pt-BR' ? 'en' : 'pt-BR';
      try { localStorage.setItem('language', cur); } catch (_) {}
      applyLang(cur);
    });
  }

  var y = document.getElementById('currentYear');
  if (y) y.textContent = new Date().getFullYear();
})();
