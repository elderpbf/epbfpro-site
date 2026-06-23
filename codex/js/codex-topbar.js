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
//   window.ThemeManager, window.BS_AUTH
import { t, languages, setLang } from './i18n.js';
import { anchorLeft, placePill } from './anchored.js';
// The Settings drawer is app-owned (the shell) with auth as an injected component.
import { init as initSettingsDrawer } from './settings-drawer.js';
import { googleSection, passwordSection } from './settings-auth.js';
import { glyphWordmark, stdColors } from './brand-logos.js';
import { TONE_OPTIONS, getTone, setTone, init as initTextTone } from './text-tone.js';
import { TEAL_OPTIONS, getTeal, setTeal, init as initTealTone } from './teal-tone.js';
import { createBell } from './notif-bell.js';
import { cohorts as cohortsApi } from './codex-api.js';
import { signOut } from './codex-login.js'; // Codex own sign-out (item 11.2): clears the admin session and returns to /codex/, not /backstage/

const GEAR_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

const HAMBURGER_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';

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
    glyph: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>' },
  { key: 'certificates', labelKey: 'nav.certificates', href: '/codex/?tab=certificates',
    glyph: '<circle cx="12" cy="8" r="6"></circle><path d="M12 14v8"></path><path d="M8 18l4 4 4-4"></path>' }
];

function _svg(inner) {
  return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
}

// Pure: the bottom-nav item descriptors, one per functional tab in TABS order,
// with the active one flagged. The mobile bottom bar renders from this (same
// source as the desktop top strip), so the two navs never drift.
export function botNavItems(active) {
  return TABS.map((tab) => ({
    key: tab.key, labelKey: tab.labelKey, href: tab.href, glyph: tab.glyph,
    active: tab.key === active,
  }));
}

// Sub-tabs (5c): two display modes (hover pill default, persistent bar) via a
// global pref; positioning reuses the lifted anchored.js.
const SUBTAB_MODE_KEY = 'codex_subtab_mode';

export function resolveSubtabMode(stored) {
  return stored === 'bar' ? 'bar' : 'pill';
}

// Pill mode previews EVERY tab's sub-tabs on hover, but only the tab you're
// actually ON should show a highlighted (current-page) sub-tab. A tab's
// `subtabs()` registry resolves an undefined sub to its FIRST entry, so a
// previewed (non-active) tab would otherwise highlight its first sub-tab. Strip
// the active flag from every non-active tab; the active tab keeps its highlight.
export function pruneInactiveHighlights(subTabsByTab, active) {
  for (const key of Object.keys(subTabsByTab || {})) {
    if (key === active) continue;
    for (const s of subTabsByTab[key] || []) s.active = false;
  }
  return subTabsByTab;
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

// 'pill' mode: hovering ANY tab shows THAT tab's sub-tabs under it (one pill,
// repopulated per hover), so you jump straight to a sub-tab. None -> no pill.
function renderSubPill(header, strip, subTabsByTab) {
  const pill = document.createElement('div');
  pill.className = 'cdx-subpill';
  pill.setAttribute('role', 'tablist');
  pill.setAttribute('aria-label', 'Sub-navegação');
  header.appendChild(pill);
  let hideT = null;
  const hide = () => pill.classList.remove('on');
  const scheduleHide = () => { hideT = setTimeout(hide, 180); };
  const showFor = (tabEl, items) => {
    clearTimeout(hideT);
    if (!items || !items.length) return hide(); // no sub-tabs -> click the main tab
    pill.innerHTML = '';
    _subtabLinks(items).forEach((a) => pill.appendChild(a));
    pill.classList.add('on');
    const hr = header.getBoundingClientRect();
    const ar = tabEl.getBoundingClientRect();
    pill.style.top = (ar.bottom - hr.top + 4) + 'px';
    pill.style.left = anchorLeft({
      containerW: hr.width, contentW: pill.offsetWidth,
      anchorCenter: ar.left + ar.width / 2 - hr.left, mode: 'under',
    }) + 'px';
  };
  strip.querySelectorAll('.cdx-tab').forEach((tabEl) => {
    tabEl.addEventListener('mouseenter', () => showFor(tabEl, subTabsByTab[tabEl.dataset.tab]));
    tabEl.addEventListener('mouseleave', scheduleHide);
  });
  pill.addEventListener('mouseenter', () => clearTimeout(hideT)); // hover bridge
  pill.addEventListener('mouseleave', scheduleHide);
}

// The pill/bar toggle for the Settings drawer; persists the pref and reloads.
function subtabModeSection() {
  return {
    id: 'cdx-subtabs',
    title: t('settings.subtabs_title'),
    content:
      '<button class="bs-toggle-btn" id="sd-subtab-mode"></button>' +
      '<p class="bs-hint">' + t('settings.subtabs_hint') + '</p>',
    onInit() {
      const btn = document.getElementById('sd-subtab-mode');
      if (!btn) return;
      const sync = () => { btn.textContent = subtabMode() === 'pill' ? t('settings.subtabs_pill') : t('settings.subtabs_bar'); };
      sync();
      btn.addEventListener('click', () => {
        const next = subtabMode() === 'pill' ? 'bar' : 'pill';
        try { localStorage.setItem(SUBTAB_MODE_KEY, next); } catch (_) {}
        location.reload();
      });
    },
  };
}

// Appearance (dark mode): two live tone pickers in one section — text colour
// (the grey for primary text + the old #fff text-on-accent spots, via
// js/text-tone.js → --cdx-text-dark) and the brand teal depth (button fills +
// accents, via js/teal-tone.js → --cdx-teal-dark). Admin tuning surface, Codex
// only; both persist and apply live (the vars live on <html>). Text swatches
// preview the tone as text on a teal fill; teal swatches show the teal itself.
function appearanceSection() {
  const swatch = (cls, val, label, bg, fg) =>
    '<button type="button" class="' + cls + '" data-val="' + val + '"' +
      ' title="' + label + ' (' + val + ')"' +
      ' style="width:30px;height:30px;border-radius:7px;border:2px solid transparent;outline:none;' +
        'cursor:pointer;background:' + bg + ';color:' + fg + ';font-weight:700;font-size:.82rem;line-height:1">A</button>';
  const textSw = TONE_OPTIONS.map((o) => swatch('cdx-tone-sw', o.value, o.label, '#0d9488', o.value)).join('');
  const tealSw = TEAL_OPTIONS.map((o) => swatch('cdx-teal-sw', o.value, o.label, o.value, '#e5e7eb')).join('');
  return {
    id: 'cdx-appearance',
    title: t('settings.appearance_title'),
    content:
      '<p class="bs-hint" style="margin:0 0 .35rem;font-weight:600;color:var(--text-primary)">' + t('settings.appearance_text') + '</p>' +
      '<div class="cdx-tone-row" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:.7rem">' + textSw + '</div>' +
      '<p class="bs-hint" style="margin:0 0 .35rem;font-weight:600;color:var(--text-primary)">' + t('settings.appearance_teal') + '</p>' +
      '<div class="cdx-teal-row" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:.5rem">' + tealSw + '</div>' +
      '<p class="bs-hint">' + t('settings.appearance_hint') + '</p>',
    onInit() {
      const wire = (sel, getCur, setFn) => {
        const row = document.querySelector(sel);
        if (!row) return;
        const sync = () => row.querySelectorAll('button').forEach((b) => {
          b.style.outline = b.getAttribute('data-val') === getCur() ? '2px solid var(--primary)' : 'none';
          b.style.outlineOffset = '2px';
        });
        sync();
        row.querySelectorAll('button').forEach((b) =>
          b.addEventListener('click', () => { setFn(b.getAttribute('data-val')); sync(); }));
      };
      wire('.cdx-tone-row', getTone, setTone);
      wire('.cdx-teal-row', getTeal, setTeal);
    },
  };
}

// Orb section: the homepage hero light's behaviour. The orb lives on the public
// landing (js/orb.js), but it reads its mode from localStorage on the SAME origin,
// so Élder sets it here (the admin console) and it applies on pensoia.com's home.
// Three modes mirror the old landing test chips: Salta / Desce / Fica. Hardcoded
// PT like its neighbour sections; no new CSS var (inline highlight via --primary).
const ORB_MODE_KEY = 'plp_orb_mode';
const ORB_MODES = [
  { val: 'leap',    key: 'settings.orb_leap' },
  { val: 'descend', key: 'settings.orb_descend' },
  { val: 'stay',    key: 'settings.orb_stay' },
];
function orbSection() {
  return {
    id: 'cdx-orb',
    title: t('settings.orb_title'),
    content:
      '<div class="cdx-orb-row" style="display:flex;gap:8px;margin-bottom:.5rem">' +
        ORB_MODES.map((o) =>
          '<button type="button" class="bs-toggle-btn cdx-orb-mode" data-val="' + o.val + '" style="flex:1">' + t(o.key) + '</button>'
        ).join('') +
      '</div>' +
      '<p class="bs-hint">' + t('settings.orb_hint') + '</p>',
    onInit() {
      const row = document.querySelector('.cdx-orb-row');
      if (!row) return;
      const cur = () => { try { return localStorage.getItem(ORB_MODE_KEY) || 'leap'; } catch (_) { return 'leap'; } };
      const sync = () => row.querySelectorAll('button').forEach((b) => {
        const on = b.getAttribute('data-val') === cur();
        b.style.color = on ? 'var(--primary)' : '';
        b.style.borderColor = on ? 'var(--primary)' : '';
      });
      sync();
      row.querySelectorAll('button').forEach((b) =>
        b.addEventListener('click', () => {
          try { localStorage.setItem(ORB_MODE_KEY, b.getAttribute('data-val')); } catch (_) {}
          sync();
        }));
    },
  };
}

// Developer section: toggles the shared debug pill (backstage/js/debug.js) via
// window.bsDebugMount/Unmount + the bs_debug flag. Dev tooling, not auth, so the
// topbar (app chrome) composes it into the drawer, not the drawer shell.
function debugSection() {
  return {
    id: 'sd-debug',
    title: t('settings.dev_title'),
    content:
      '<p style="font-size:.88rem;color:var(--text-primary);margin-bottom:.5rem">' + t('settings.dev_label') + '</p>' +
      '<button class="bs-toggle-btn" id="sd-debug-toggle" style="margin-bottom:.5rem"></button>' +
      '<p class="bs-hint">' + t('settings.dev_hint') + '</p>',
    onInit() {
      const btn = document.getElementById('sd-debug-toggle');
      if (!btn) return;
      const sync = () => {
        const on = localStorage.getItem('bs_debug') === '1';
        btn.textContent = on ? t('settings.dev_disable') : t('settings.dev_enable');
        btn.style.color = on ? 'var(--primary)' : '';
        btn.style.borderColor = on ? 'var(--primary)' : '';
      };
      sync();
      btn.addEventListener('click', () => {
        const on = localStorage.getItem('bs_debug') === '1';
        localStorage.setItem('bs_debug', on ? '0' : '1');
        sync();
        if (!on) { if (window.bsDebugMount) window.bsDebugMount(); }
        else     { if (window.bsDebugUnmount) window.bsDebugUnmount(); }
      });
    },
  };
}

export function init(opts) {
  opts = opts || {};
  const active = opts.active || '';
  const sections = opts.sections || [];
  // active tab's sub-tabs ({ label, href, active }); subTabsByTab keys all tabs
  // so pill mode can reveal any tab's sub-tabs on hover.
  const subTabs = opts.subTabs || [];
  const subTabsByTab = opts.subTabsByTab || {};
  if (subTabs.length && !subTabsByTab[active]) subTabsByTab[active] = subTabs; // seed active
  pruneInactiveHighlights(subTabsByTab, active); // only the active tab shows a highlight
  const container = document.querySelector('.bs-app') || document.body;

  const header = document.createElement('header');
  header.className = 'bs-topbar';

  const inner = document.createElement('div');
  inner.className = 'bs-topbar-inner bs-topbar-inner--with-tabs';

  // Mobile hamburger: toggles the current tab's sidebar drawer. CSS-gated to
  // phones; the click is wired below once the backdrop exists.
  const burger = document.createElement('button');
  burger.className = 'bs-icon-btn cdx-hamburger';
  burger.setAttribute('aria-label', 'Menu');
  burger.innerHTML = HAMBURGER_SVG;
  inner.appendChild(burger);

  // Brand wordmark (reused from brand-logos.js), links back to the portal.
  const brand = document.createElement('a');
  brand.href = '/codex/';
  brand.className = 'bs-topbar-logo';
  brand.setAttribute('aria-label', 'PensoIA — Codex');
  const wmLight = document.createElement('span');
  wmLight.className = 'bs-topbar-logo-light bs-topbar-mark';
  wmLight.setAttribute('aria-hidden', 'true');
  const wmDark = document.createElement('span');
  wmDark.className = 'bs-topbar-logo-dark bs-topbar-mark';
  wmDark.setAttribute('aria-hidden', 'true');
  wmLight.innerHTML = glyphWordmark(stdColors('white'));
  wmDark.innerHTML = glyphWordmark(stdColors('navy'));
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
    a.dataset.tab = tab.key; // key for the pill's per-tab sub-tab lookup
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
  // Leading spacer mirrors the trailing one below, so the tab strip sits
  // centered between the brand and the right-side controls on the full-width bar.
  const spacerLead = document.createElement('div');
  spacerLead.className = 'bs-topbar-spacer';
  inner.appendChild(spacerLead);
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

  // Notification bell (teacher, cross-turma). Computed from forum activity; clicking
  // an item deep-links to THAT turma's dossiê Fórum tab (Cohorts reads fclient/fturma
  // and opens the Fórum sub-tab). Refreshes on load + window focus.
  const bell = createBell({
    fetchNotifications: () => cohortsApi.forumNotifications(),
    markSeen: () => cohortsApi.forumMarkSeen({}),
    onNavigate: (item) => {
      if (typeof location === 'undefined') return;
      let url = '/codex/?tab=cohorts';
      if (item && item.client_slug && item.turma_slug) {
        url += '&fclient=' + encodeURIComponent(item.client_slug) +
               '&fturma=' + encodeURIComponent(item.turma_slug);
      }
      location.href = url;
    },
    t,
  });
  inner.appendChild(bell.el);

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
  logoutBtn.addEventListener('click', signOut);
  inner.appendChild(logoutBtn);

  header.appendChild(inner);

  container.insertBefore(header, container.firstChild);

  // rendered after insert so the positioner can measure; pill renders if any tab
  // has sub-tabs, bar only for the active tab.
  if (subtabMode() === 'bar') {
    if (subTabs.length > 0) {
      const anchorTab = strip.querySelector('.cdx-tab.active') || strip;
      renderSubBar(header, anchorTab, subTabs);
    }
  } else if (Object.keys(subTabsByTab).some((k) => (subTabsByTab[k] || []).length)) {
    renderSubPill(header, strip, subTabsByTab);
  }

  // Mobile sub-strip: a full-width scrollable copy of the active tab's sub-tabs,
  // pinned under the topbar. CSS-gated to phones, where the desktop pill/bar is
  // hidden (hover is touch-useless); always present so touch never loses sub-tabs.
  if (subTabs.length) {
    const mrow = document.createElement('div');
    mrow.className = 'cdx-subrow cdx-subrow--mobile';
    const mstrip = document.createElement('nav');
    mstrip.className = 'cdx-substrip';
    mstrip.setAttribute('role', 'tablist');
    mstrip.setAttribute('aria-label', 'Sub-navegação');
    _subtabLinks(subTabs).forEach((a) => mstrip.appendChild(a));
    mrow.appendChild(mstrip);
    header.appendChild(mrow);
  }

  // Mobile bottom navigation (advradar-style): the four functional tabs as an
  // icon+label bar pinned to the bottom edge. Hidden on desktop; CSS reveals it
  // and hides the flex-starved top .cdx-tabs strip below the phone breakpoint.
  const botnav = document.createElement('nav');
  botnav.className = 'cdx-botnav';
  botnav.setAttribute('role', 'tablist');
  botnav.setAttribute('aria-label', 'Codex');
  botNavItems(active).forEach((tab) => {
    const a = document.createElement('a');
    a.className = 'cdx-botnav-item cdx-botnav-item--' + tab.key + (tab.active ? ' active' : '');
    a.href = tab.href || '#';
    a.setAttribute('role', 'tab');
    if (tab.active) a.setAttribute('aria-current', 'page');
    const icon = document.createElement('span');
    icon.className = 'cdx-botnav-icon';
    icon.innerHTML = _svg(tab.glyph);
    const label = document.createElement('span');
    label.className = 'cdx-botnav-label';
    label.textContent = t(tab.labelKey);
    a.appendChild(icon);
    a.appendChild(label);
    botnav.appendChild(a);
  });
  // Append at body level (not inside .bs-app) so the fixed bar gets a clean
  // top-level stacking context, above the page content on tall scrolling tabs.
  document.body.appendChild(botnav);

  // Mobile drawer: the hamburger slides the current tab's sidebar in from the
  // left over a dim backdrop; backdrop tap, Escape, or picking a primary item
  // closes it. One shared wiring for every tab, each tab's sidebar matches
  // DRAWER_SEL; CSS owns the off-canvas transform and the phone breakpoint.
  const DRAWER_SEL = '.cdx-bank-sets, .cdx-items-list, .cdx-lessons-sidebar, .cdx-cohorts-nav';
  const drawerBackdrop = document.createElement('div');
  drawerBackdrop.className = 'cdx-drawer-backdrop';
  document.body.appendChild(drawerBackdrop);
  const _drawer = () => document.querySelector(DRAWER_SEL);
  const _closeDrawer = () => { const d = _drawer(); if (d) d.classList.remove('is-open'); drawerBackdrop.classList.remove('is-open'); };
  const _toggleDrawer = () => { const d = _drawer(); if (!d) return; const open = !d.classList.contains('is-open'); d.classList.toggle('is-open', open); drawerBackdrop.classList.toggle('is-open', open); };
  burger.addEventListener('click', _toggleDrawer);
  drawerBackdrop.addEventListener('click', _closeDrawer);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') _closeDrawer(); });
  // Picking a primary item inside the open drawer closes it to reveal the content.
  // Capture phase: the tab's own click handler re-renders the sidebar (detaching
  // the clicked node) before a bubble-phase listener would see it, so contains()
  // would read false. Capture runs first, while the target is still attached.
  document.addEventListener('click', (e) => {
    if (!drawerBackdrop.classList.contains('is-open')) return;
    const d = _drawer();
    if (d && d.contains(e.target) && e.target.closest('a[href], [data-act="pick"], [data-act="variaveis"], .cdx-item-row, [data-turma-slug]')) _closeDrawer();
  }, true);

  // Shared shell services; the sub-tab mode toggle leads the drawer sections.
  ThemeManager.init({ storageKey: 'bs_theme' });
  ThemeManager.applyTheme(localStorage.getItem('bs_theme') || 'dark');
  initTextTone(); // apply the saved dark-mode text tone (no-op at default)
  initTealTone(); // apply the saved dark-mode teal tone (no-op at default)
  // Compose the drawer in display order: the topbar's own sections, then the
  // injected auth + dev sections. The drawer shell owns none of this — Google
  // and password come from the settings-auth component, gated on their globals.
  const drawerSections = [subtabModeSection(), appearanceSection(), orbSection(), ...sections];
  if (typeof globalThis.BS_GOOGLE !== 'undefined') drawerSections.push(googleSection());
  drawerSections.push(debugSection());
  if (typeof globalThis.callWorker === 'function') drawerSections.push(passwordSection());
  initSettingsDrawer({ sections: drawerSections });
}
