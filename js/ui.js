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

// The offer-section phones (Pulso, Trilha) are static stills, not the live srcdoc-iframe
// demo: one screenshot per theme, swapped on toggle like the logo. Real-app JS demo +
// its step-caption UI are on hold (drifted from a product change, see track-50).
const DEMO_STILLS = {
  pulseStill: { light: 'images/demo-pulso-light.png', dark: 'images/demo-pulso-dark.png' },
  trailStill: { light: 'images/demo-trilha-light.png', dark: 'images/demo-trilha-dark.png' }
};
function applyDemoStills() {
  const t = getTheme() === 'dark' ? 'dark' : 'light';
  Object.keys(DEMO_STILLS).forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.src = DEMO_STILLS[id][t];
  });
}

export function initUI() {
  // theme
  const tb = document.getElementById('theme');
  const setIcon = () => { if (tb) tb.textContent = getTheme() === 'dark' ? '☀' : '☾'; };
  setIcon(); applyLogo(); applyDemoStills();
  if (tb) tb.addEventListener('click', toggleTheme);
  onTheme(() => { setIcon(); applyLogo(); applyDemoStills(); });

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
