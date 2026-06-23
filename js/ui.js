// js/ui.js — header scroll state, theme toggle + logo swap, language buttons,
// the rotating typewriter in the hero, and the scroll-reveal observer.
import { getLang, setLang, onLang, apply } from './i18n.js?v=19';
import { getTheme, toggleTheme, onTheme } from './theme.js?v=17';

function applyLogo() {
  const file = getTheme() === 'dark' ? 'glyph-wordmark_bg.navy.svg' : 'glyph-wordmark_bg.transp.svg';
  const l = document.getElementById('logo'), f = document.getElementById('logoFoot');
  if (l) l.src = 'images/brand/' + file;
  if (f) f.src = 'images/brand/' + file;
}

const LANG_SHORT = { pt: 'PT', en: 'EN', es: 'ES' };
function syncLangButtons() {
  document.querySelectorAll('.plp-langpop button[data-lang]').forEach(b =>
    b.setAttribute('aria-pressed', b.dataset.lang === getLang()));
  const cur = document.getElementById('langCur');
  if (cur) cur.textContent = LANG_SHORT[getLang()] || getLang().toUpperCase();
}

// The demo phones (real Codex app in srcdoc iframes) post {plpStep:{i,total,label}}
// on each beat. We draw the caption tab on top of the matching phone: the action
// label (swapped with a soft fade) over a segmented progress bar, one segment per beat.
function refreshTab(tab, s) {
  if (tab.hidden) tab.hidden = false;
  const segs = tab.querySelector('.plp-captab-segs');
  if (segs.childElementCount !== s.total) {
    segs.textContent = '';
    for (let i = 0; i < s.total; i++) segs.appendChild(document.createElement('span'));
  }
  [...segs.children].forEach((seg, i) => {
    seg.className = i === s.i - 1 ? 'is-active' : (i < s.i - 1 ? 'is-done' : '');
  });
  const txt = tab.querySelector('.plp-captab-txt');
  if (txt.textContent !== s.label) {
    txt.style.opacity = '0';
    setTimeout(() => { txt.textContent = s.label; txt.style.opacity = '1'; }, 170);
  }
}

function initCaptionTabs() {
  const pairs = [
    [document.getElementById('pulseFrame'), document.getElementById('pulseTab')],
    [document.getElementById('trailFrame'), document.getElementById('trailTab')]
  ].filter(([f, tab]) => f && tab);
  if (!pairs.length) return;
  addEventListener('message', (e) => {
    const s = e.data && e.data.plpStep;
    if (!s) return;
    const pair = pairs.find(([f]) => f.contentWindow === e.source);
    if (pair) refreshTab(pair[1], s);
  });
}

export function initUI() {
  // theme
  const tb = document.getElementById('theme');
  const setIcon = () => { if (tb) tb.textContent = getTheme() === 'dark' ? '☀' : '☾'; };
  setIcon(); applyLogo();
  if (tb) tb.addEventListener('click', toggleTheme);
  // keep the embedded Codex demo iframes (the real app) on the page theme
  const syncFrames = () => document.querySelectorAll('.plp-app-frame').forEach(f => {
    try { f.contentWindow.postMessage({ plpTheme: getTheme() }, '*'); } catch (_) { /* cross-doc not ready yet */ }
  });
  document.querySelectorAll('.plp-app-frame').forEach(f => f.addEventListener('load', syncFrames));
  onTheme(() => { setIcon(); applyLogo(); syncFrames(); });
  initCaptionTabs();

  // language (collapsed pill: shows the current lang, opens the options on click)
  syncLangButtons();
  const langWrap = document.getElementById('lang');
  const langBtn = document.getElementById('langBtn');
  if (langBtn && langWrap) {
    langBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = langWrap.classList.toggle('plp-langopen');
      langBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', () => {
      langWrap.classList.remove('plp-langopen');
      langBtn.setAttribute('aria-expanded', 'false');
    });
  }
  document.querySelectorAll('.plp-langpop button[data-lang]').forEach(b =>
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      setLang(b.dataset.lang); apply(document);
      if (langWrap) langWrap.classList.remove('plp-langopen');
      if (langBtn) langBtn.setAttribute('aria-expanded', 'false');
    }));
  onLang(() => { syncLangButtons(); });

  // header scroll state
  const hdr = document.getElementById('hdr');
  addEventListener('scroll', () => { if (hdr) hdr.classList.toggle('plp-sc', scrollY > 20); }, { passive: true });

  // scroll reveal
  const ro = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('plp-in'); ro.unobserve(e.target); }
  }), { threshold: .15 });
  document.querySelectorAll('.plp-reveal').forEach(el => ro.observe(el));
}
