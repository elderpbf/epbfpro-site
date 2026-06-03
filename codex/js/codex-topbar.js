// Codex topbar.
//
// Codex's own chrome: each functional tab gets a glyph + accent color, English
// keys with PT display via t(), none of the old PensoCodex/Nexo baggage. It
// REUSES the shared shell services rather than reimplementing them.
//
// Usage: import { init } from './codex-topbar.js'; init({ active: 'cohorts', sections? })
//
// During the strangler migration, tabs whose page isn't rebuilt yet link to the
// old page; flip the href to the /codex route as each migrates.
//
// Globals (shared Backstage scripts, loaded before the module boot):
//   window.ThemeManager, window.SettingsDrawer, window.BS_AUTH,
//   window.glyphWordmark, window.stdColors
import { t, languages, setLang } from './i18n.js';
import { anchorLeft, placePill } from './anchored.js';

const GEAR_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

// One entry per functional area. Keys are English; PT labels via t(). Colors
// are CSS tokens in codex.css. href points to the old page until the tab is
// migrated to /codex/.
export const TABS = [
  { key: 'lessons',   labelKey: 'nav.lessons',   href: '/codex/?tab=lessons',
    glyph: '<rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line>' },
  { key: 'content',   labelKey: 'nav.content',   href: '/codex/?tab=content',
    glyph: '<polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline>' },
  { key: 'cohorts',   labelKey: 'nav.cohorts',   href: '/codex/',
    glyph: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>' },
  { key: 'questions', labelKey: 'nav.questions', href: '/codex/?tab=questions',
    glyph: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>' }
];

function _svg(inner) {
  return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
}

// ── Sub-tabs (5c) ────────────────────────────────────────────
// One sub-navigation, two display modes chosen by a persisted GLOBAL pref (the
// toggle lives in the Settings drawer, below). Applies to every tab that
// declares sub-tabs (Content, Questions, ...). Positioning reuses the lifted
// anchored.js, the same mechanic as the Slides editor context bar.
//   'pill' (default): hovering the active tab reveals a floating pill of its
//      sub-tabs, centered under the tab, receding on mouse-out (a hover bridge
//      keeps it open while the cursor is on it). The topbar stays one row.
//   'bar': a persistent strip centered under the active tab.
const SUBTAB_MODE_KEY = 'codex_subtab_mode';

export function resolveSubtabMode(stored) {
  return stored === 'bar' ? 'bar' : 'pill';
}
function subtabMode() {
  let stored = null;
  try { stored = localStorage.getItem(SUBTAB_MODE_KEY); } catch (_) {}
  return resolveSubtabMode(stored);
}

function _subtabLinks(subTabs) {
  return subTabs.map((s) => {
    const a = document.createElement('a');
    a.className = 'cdx-subtab' + (s.active ? ' active' : '');
    a.href = s.href || '#';
    a.setAttribute('role', 'tab');
    if (s.active) a.setAttribute('aria-current', 'page');
    a.textContent = s.label;
    return a;
  });
}

// 'bar' mode: a persistent strip, centered under the active tab via placePill.
function renderSubBar(header, anchorTab, subTabs) {
  const row = document.createElement('div');
  row.className = 'cdx-subrow';
  const strip = document.createElement('nav');
  strip.className = 'cdx-substrip';
  strip.setAttribute('role', 'tablist');
  strip.setAttribute('aria-label', 'Sub-navegação');
  _subtabLinks(subTabs).forEach((a) => strip.appendChild(a));
  row.appendChild(strip);
  header.appendChild(row);
  const place = () => placePill(row, strip, { anchorEl: anchorTab, mode: 'under' });
  requestAnimationFrame(place);
  window.addEventListener('resize', place);
}

// 'pill' mode: a floating pill, hidden until the active tab is hovered.
function renderSubPill(header, anchorTab, subTabs) {
  const pill = document.createElement('div');
  pill.className = 'cdx-subpill';
  pill.setAttribute('role', 'tablist');
  pill.setAttribute('aria-label', 'Sub-navegação');
  _subtabLinks(subTabs).forEach((a) => pill.appendChild(a));
  header.appendChild(pill);
  let hideT = null;
  const show = () => {
    clearTimeout(hideT);
    pill.classList.add('on');
    const hr = header.getBoundingClientRect();
    const ar = anchorTab.getBoundingClientRect();
    pill.style.top = (ar.bottom - hr.top + 4) + 'px';
    pill.style.left = anchorLeft({
      containerW: hr.width, contentW: pill.offsetWidth,
      anchorCenter: ar.left + ar.width / 2 - hr.left, mode: 'under',
    }) + 'px';
  };
  const scheduleHide = () => { hideT = setTimeout(() => pill.classList.remove('on'), 180); };
  anchorTab.addEventListener('mouseenter', show);
  anchorTab.addEventListener('mouseleave', scheduleHide);
  pill.addEventListener('mouseenter', () => clearTimeout(hideT)); // hover bridge
  pill.addEventListener('mouseleave', scheduleHide);
}

// The pill/bar toggle, injected into the Settings drawer (the global config
// panel). Flipping it persists the pref and reloads (same as the language
// toggle), so the next render picks up the chosen mode.
function subtabModeSection() {
  return {
    id: 'cdx-subtabs',
    title: 'Sub-abas',
    content:
      '<button class="bs-toggle-btn" id="sd-subtab-mode"></button>' +
      '<p class="bs-hint">Como as sub-abas (Conteúdo, Perguntas) aparecem: pílula flutuante ao passar o mouse na aba, ou barra fixa abaixo dela.</p>',
    onInit() {
      const btn = document.getElementById('sd-subtab-mode');
      if (!btn) return;
      const sync = () => { btn.textContent = subtabMode() === 'pill' ? 'Pílula ao passar o mouse' : 'Barra fixa'; };
      sync();
      btn.addEventListener('click', () => {
        const next = subtabMode() === 'pill' ? 'bar' : 'pill';
        try { localStorage.setItem(SUBTAB_MODE_KEY, next); } catch (_) {}
        location.reload();
      });
    },
  };
}

export function init(opts) {
  opts = opts || {};
  const active = opts.active || '';
  const sections = opts.sections || [];
  // Sub-tabs for the active tab, rendered as the hover-pill / persistent-bar
  // chrome (5c, see the helpers above). Each entry: { label, href, active }.
  // Empty/omitted -> no sub-navigation (single-row topbar).
  const subTabs = opts.subTabs || [];
  const container = document.querySelector('.bs-app') || document.body;

  const header = document.createElement('header');
  header.className = 'bs-topbar';

  const inner = document.createElement('div');
  inner.className = 'bs-topbar-inner bs-topbar-inner--with-tabs';

  // Brand wordmark (reused from brand-logos.js), links back to the portal.
  const brand = document.createElement('a');
  brand.href = '/backstage/';
  brand.className = 'bs-topbar-logo';
  brand.setAttribute('aria-label', 'PensoIA — Codex');
  const wmLight = document.createElement('span');
  wmLight.className = 'bs-topbar-logo-light bs-topbar-mark';
  wmLight.setAttribute('aria-hidden', 'true');
  const wmDark = document.createElement('span');
  wmDark.className = 'bs-topbar-logo-dark bs-topbar-mark';
  wmDark.setAttribute('aria-hidden', 'true');
  if (window.glyphWordmark && window.stdColors) {
    wmLight.innerHTML = window.glyphWordmark(window.stdColors('white'));
    wmDark.innerHTML = window.glyphWordmark(window.stdColors('navy'));
  }
  brand.appendChild(wmLight);
  brand.appendChild(wmDark);
  const suffix = document.createElement('span');
  suffix.className = 'bs-topbar-name';
  suffix.textContent = 'Codex';
  brand.appendChild(suffix);
  inner.appendChild(brand);

  // Rich tab strip: glyph + accent color + PT label per functional area.
  const strip = document.createElement('nav');
  strip.className = 'cdx-tabs';
  strip.setAttribute('role', 'tablist');
  strip.setAttribute('aria-label', 'Codex');
  TABS.forEach((tab) => {
    const a = document.createElement('a');
    a.className = 'cdx-tab cdx-tab--' + tab.key + (tab.key === active ? ' active' : '');
    a.href = tab.href || '#';
    a.setAttribute('role', 'tab');
    if (tab.key === active) a.setAttribute('aria-current', 'page');
    const icon = document.createElement('span');
    icon.className = 'cdx-tab-icon';
    icon.innerHTML = _svg(tab.glyph);
    const label = document.createElement('span');
    label.className = 'cdx-tab-label';
    label.textContent = t(tab.labelKey);
    a.appendChild(icon);
    a.appendChild(label);
    strip.appendChild(a);
  });
  inner.appendChild(strip);

  const spacer = document.createElement('div');
  spacer.className = 'bs-topbar-spacer';
  inner.appendChild(spacer);

  // Language toggle — appears only when more than one dictionary is loaded.
  // Two languages, so it's a single button showing the language you'd switch
  // TO ("EN" while in PT-BR, "BR" while in EN). Click persists + reloads.
  const langs = languages();
  if (langs.length > 1) {
    let current = 'pt-BR';
    try { current = localStorage.getItem('codex_lang') || 'pt-BR'; } catch (_) {}
    const target = current === 'pt-BR' ? 'en' : 'pt-BR';
    const LABEL = { 'en': 'EN', 'pt-BR': 'BR' };
    const langBtn = document.createElement('button');
    langBtn.className = 'cdx-lang-btn';
    langBtn.textContent = LABEL[target];
    langBtn.title = target === 'en' ? 'Switch to English' : 'Mudar para Português';
    langBtn.addEventListener('click', () => { setLang(target); location.reload(); });
    inner.appendChild(langBtn);
  }

  // Theme toggle (wired by ThemeManager).
  const themeBtn = document.createElement('button');
  themeBtn.className = 'bs-icon-btn theme-toggle';
  themeBtn.id = 'themeToggle';
  themeBtn.setAttribute('aria-label', 'Alternar tema');
  const themeIcon = document.createElement('span');
  themeIcon.id = 'themeIcon';
  themeBtn.appendChild(themeIcon);
  inner.appendChild(themeBtn);

  // Settings gear (wired by SettingsDrawer).
  const settingsBtn = document.createElement('button');
  settingsBtn.className = 'bs-icon-btn';
  settingsBtn.id = 'settings-btn';
  settingsBtn.setAttribute('aria-label', 'Configurações');
  settingsBtn.title = 'Configurações';
  settingsBtn.innerHTML = GEAR_SVG;
  inner.appendChild(settingsBtn);

  // Logout.
  const logoutBtn = document.createElement('button');
  logoutBtn.className = 'bs-logout-btn';
  logoutBtn.id = 'logout-btn';
  logoutBtn.textContent = t('nav.logout');
  logoutBtn.addEventListener('click', BS_AUTH.logout);
  inner.appendChild(logoutBtn);

  header.appendChild(inner);

  container.insertBefore(header, container.firstChild);

  // Sub-tabs (5c): rendered into the LIVE header (after insert) so the positioner
  // can measure the active tab. Two modes chosen by the global pref; only the
  // active tab declares sub-tabs, so tabs without them keep the single-row topbar.
  if (subTabs.length > 0) {
    const anchorTab = strip.querySelector('.cdx-tab.active') || strip;
    if (subtabMode() === 'bar') renderSubBar(header, anchorTab, subTabs);
    else renderSubPill(header, anchorTab, subTabs);
  }

  // Reuse shared shell services. The pill/bar toggle is a global Codex pref, so
  // it leads the Settings drawer sections (before any page-injected ones).
  ThemeManager.init({ storageKey: 'bs_theme' });
  ThemeManager.applyTheme(localStorage.getItem('bs_theme') || 'dark');
  SettingsDrawer.init({ sections: [subtabModeSection(), ...sections] });
}
