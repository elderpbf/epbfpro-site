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
import { call as codexCall } from './codex-api.js';
// The Settings drawer is app-owned (the shell) with auth as an injected component.
import { init as initSettingsDrawer } from './settings-drawer.js';
import { googleSection, passwordSection } from './settings-auth.js';
import { glyphWordmark, stdColors } from './brand-logos.js';
import { glyphSvg } from './glyphs.js';
import { TONE_OPTIONS, getTone, setTone, init as initTextTone } from './text-tone.js';
import { TEAL_OPTIONS, getTeal, setTeal, init as initTealTone } from './teal-tone.js';
import { createBell } from './notif-bell.js';
import { cohorts as cohortsApi } from './codex-api.js';
import { signOut } from './codex-login.js'; // Codex own sign-out (item 11.2): clears the admin session and returns to /codex/, not /backstage/

const GEAR_SVG = glyphSvg('settings', { size: 18 });
const HAMBURGER_SVG = glyphSvg('menu', { size: 20 });

// One entry per functional area. Keys are English; PT labels via t(). Colors
// are CSS tokens in codex.css. href points to the old page until the tab is
// migrated to /codex/.
//
// `glyph` now holds the FULL svg from the shared library, not bare inner markup, so the
// local _svg() wrapper is gone: it was a second, drifting copy of glyphSvg's job.
export const TABS = [
  { key: 'lessons',   labelKey: 'nav.lessons',   href: '/codex/?tab=lessons',
    glyph: glyphSvg('monitor') },
  { key: 'content',   labelKey: 'nav.content',   href: '/codex/?tab=content',
    glyph: glyphSvg('layers') },
  { key: 'cohorts',   labelKey: 'nav.cohorts',   href: '/codex/',
    glyph: glyphSvg('users') },
  { key: 'questions', labelKey: 'nav.questions', href: '/codex/?tab=questions',
    glyph: glyphSvg('message-circle') },
  { key: 'certificates', labelKey: 'nav.certificates', href: '/codex/?tab=certificates',
    glyph: glyphSvg('certificate') }
];

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

// Student-facing language (Élder, single GLOBAL setting): the language of the
// student screens (trilha + display), independent of the admin UI language. It
// lives here as a Settings-drawer option (moved out of the topbar, where it was a
// stray "Alunos: BR/EN" button). The button shows the CURRENT student language and
// toggles on click; the audience surfaces adopt it on their next load. Composed
// into the drawer only when more than one dictionary is loaded (see init()).
function studentLangSection() {
  const LBL = { 'en': t('settings.student_lang_en'), 'pt-BR': t('settings.student_lang_pt') };
  return {
    id: 'cdx-student-lang',
    title: t('settings.student_lang_title'),
    content:
      '<button class="bs-toggle-btn" id="sd-student-lang" style="margin-bottom:.5rem"></button>' +
      '<p class="bs-hint">' + t('settings.student_lang_hint') + '</p>',
    onInit() {
      const btn = document.getElementById('sd-student-lang');
      if (!btn) return;
      let cur = 'pt-BR';
      const render = () => { btn.textContent = LBL[cur] || LBL['pt-BR']; };
      (async () => {
        try { const r = await codexCall('ct_get_student_lang'); if (r && r.lang) cur = r.lang; } catch (_) { /* default BR */ }
        render();
      })();
      btn.addEventListener('click', async () => {
        const tgt = cur === 'pt-BR' ? 'en' : 'pt-BR';
        btn.disabled = true;
        try { const r = await codexCall('ct_set_student_lang', { lang: tgt }); cur = (r && r.lang) ? r.lang : tgt; } catch (_) { /* leave as-is */ }
        btn.disabled = false;
        render();
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
    icon.innerHTML = tab.glyph;
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

  // Student-facing language (Élder, global setting) now lives as an option IN the
  // Settings drawer (studentLangSection), not a topbar button — see the drawer
  // composition below.

  // Notification bell (teacher, cross-turma). Computed from forum activity; clicking
  // an item deep-links to THAT turma's dossiê Fórum tab (Cohorts reads fclient/fturma
  // and opens the Fórum sub-tab). Refreshes on load + window focus.
  const bell = createBell({
    role: 'admin',
    fetchNotifications: () => cohortsApi.forumNotifications(),
    // Bell-open clears only the Dispensáveis tier (scope glance); "marcar tudo" clears
    // everything (scope all); the × dismisses one Acionável by its stable notif_key.
    markSeen: () => cohortsApi.forumMarkSeen({ scope: 'glance' }),
    markAll: () => cohortsApi.forumMarkSeen({ scope: 'all' }),
    dismissItem: (item) => cohortsApi.forumDismiss({ notif_key: item.notif_key, up_to_at: item.created_at }),
    onNavigate: (item) => {
      if (typeof location === 'undefined') return;
      let url = '/codex/?tab=cohorts';
      if (item && item.client_slug && item.turma_slug) {
        url += '&fclient=' + encodeURIComponent(item.client_slug) +
               '&fturma=' + encodeURIComponent(item.turma_slug);
        // A tarefa-submission notification deep-links straight to that tarefa in its
        // aula (Cohorts opens the aula's Tarefas sub-tab on the item); a forum item
        // keeps the plain client/turma (opens the Fórum sub-tab).
        if (item.type === 'tarefa_submission') {
          if (item.aula_number != null) url += '&faula=' + encodeURIComponent(item.aula_number);
          if (item.item_id != null) url += '&fitem=' + encodeURIComponent(item.item_id);
        }
        // A pending-student notification (e-sino) deep-links to the turma's Participantes
        // sub-tab, where approval happens (Élder: the notification LEADS to the area, it
        // does not act inline).
        if (item.type === 'student_pending') url += '&fdtab=participantes';
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

  // Logout moved into the Settings drawer footer (pinned at the bottom); see the
  // initSettingsDrawer({ footer }) call below.

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
  // pinned ABOVE the bottom nav (Élder 2026-07-24: a sub-tab is part of the same nav
  // as the app tabs, which already live at the bottom on phones). CSS (codex.css) does
  // the actual positioning; this stays in `header` only so it measures/scrolls with the
  // rest of the chrome markup. Always present so touch never loses sub-tabs.
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
    // Real height, not a hardcoded guess: .cdx-view's bottom padding (codex.css) reads
    // this so it clears BOTH fixed bars (botnav + this one) whenever this one exists.
    const publishSubrowHeight = () => {
      const h = Math.round(mrow.getBoundingClientRect().height);
      document.documentElement.style.setProperty('--cdx-subrow-mobile-h', h ? h + 'px' : '0px');
    };
    publishSubrowHeight();
    window.addEventListener('resize', publishSubrowHeight);
  } else {
    document.documentElement.style.setProperty('--cdx-subrow-mobile-h', '0px');
  }

  // Publish the chrome's REAL height as --cdx-chrome-h, for the position:fixed rails that
  // have to clear it (cohorts' CLIENTES, Sessões). They each hardcoded `padding-top: 94px`
  // = 65px bar + a 29px sub-BAR — but 'pill' is the DEFAULT sub-tab mode and has no bar, so
  // the default rendering left a 29px gap between the topbar and the rail (Élder 2026-07-17:
  // "não chega até a barra superior"). A magic number cannot know a mode it never reads;
  // the bar owns its own height, so it is the one that must say so. Measured after every
  // sub-bar/sub-row insert above, so it counts whatever actually rendered.
  const publishChromeHeight = () => {
    const h = Math.round(header.getBoundingClientRect().height);
    if (h) document.documentElement.style.setProperty('--cdx-chrome-h', h + 'px');
  };
  publishChromeHeight();
  // The bar wraps/reflows at narrow widths, so its height is not a constant. (The mode toggle
  // itself reloads the page, so it needs no hook here.)
  window.addEventListener('resize', publishChromeHeight);

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
    icon.innerHTML = tab.glyph;
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
  // `.cdx-sessions-sidebar` joined this list in track-41: Sessões had NO hamburger at all —
  // not a CSS bug, it was simply never registered here, which is the coupling this list IS
  // (the chrome knowing each tab's interior by class name). Élder: "all should have them".
  const DRAWER_SEL = '.cdx-bank-sets, .cdx-items-list, .cdx-lessons-sidebar, .cdx-cohorts-nav, .cdx-sessions-sidebar';
  // What counts as "picking a primary item" (closes the drawer to reveal the content).
  // `.cdx-rail-row` is the shared rail's row, so every migrated rail is covered by BEING a
  // rail — the same direction DRAWER_SEL itself has to go (see architecture/list-rail.md and
  // track-41: this list of per-tab class names is the coupling, not the design).
  // It replaced `[data-turma-slug]`, which cohorts' bespoke turma row used to carry and which
  // the migration to mountRail retired — leaving the selector matching NOTHING in the repo,
  // i.e. tapping a turma on a phone updated the dossiê behind a drawer that stayed open.
  const DRAWER_PICK_SEL = 'a[href], [data-act="pick"], [data-act="variaveis"], .cdx-item-row, .cdx-rail-row';
  const drawerBackdrop = document.createElement('div');
  drawerBackdrop.className = 'cdx-drawer-backdrop';
  document.body.appendChild(drawerBackdrop);
  const _drawer = () => document.querySelector(DRAWER_SEL);
  const _closeDrawer = () => { const d = _drawer(); if (d) d.classList.remove('is-open'); drawerBackdrop.classList.remove('is-open'); };
  const _toggleDrawer = () => { const d = _drawer(); if (!d) return; const open = !d.classList.contains('is-open'); d.classList.toggle('is-open', open); drawerBackdrop.classList.toggle('is-open', open); };
  burger.addEventListener('click', _toggleDrawer);
  drawerBackdrop.addEventListener('click', _closeDrawer);
  // Some sub-tabs have no sidebar at all (a single dashboard, not a list+detail split —
  // Élder found Certificados/Emitidos and Questões/Stats this way): showing a hamburger
  // there is a dead affordance, not a fixable click. `topbar()` runs before the tab's own
  // `mount()` (index.html), so the sidebar markup (if any) doesn't exist in the DOM yet
  // right here; one frame later it does, even if the tab's DATA still loads async after
  // that. Inline style, not a class or `hidden`, so it wins over `.cdx-hamburger{display:
  // inline-flex}` at the phone breakpoint regardless of source order.
  requestAnimationFrame(() => { burger.style.display = _drawer() ? '' : 'none'; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') _closeDrawer(); });
  // Picking a primary item inside the open drawer closes it to reveal the content.
  // Capture phase: the tab's own click handler re-renders the sidebar (detaching
  // the clicked node) before a bubble-phase listener would see it, so contains()
  // would read false. Capture runs first, while the target is still attached.
  document.addEventListener('click', (e) => {
    if (!drawerBackdrop.classList.contains('is-open')) return;
    const d = _drawer();
    if (d && d.contains(e.target) && e.target.closest(DRAWER_PICK_SEL)) _closeDrawer();
  }, true);

  // Shared shell services; the sub-tab mode toggle leads the drawer sections.
  ThemeManager.init({ storageKey: 'bs_theme' });
  ThemeManager.applyTheme(localStorage.getItem('bs_theme') || 'dark');
  initTextTone(); // apply the saved dark-mode text tone (no-op at default)
  initTealTone(); // apply the saved dark-mode teal tone (no-op at default)
  // Compose the drawer in display order: the topbar's own sections, then the
  // injected auth + dev sections. The drawer shell owns none of this — Google
  // and password come from the settings-auth component, gated on their globals.
  const drawerSections = [subtabModeSection(), appearanceSection(), orbSection()];
  if (languages().length > 1) drawerSections.push(studentLangSection());
  drawerSections.push(...sections);
  if (typeof globalThis.BS_GOOGLE !== 'undefined') drawerSections.push(googleSection());
  drawerSections.push(debugSection());
  if (typeof globalThis.callWorker === 'function') drawerSections.push(passwordSection());
  initSettingsDrawer({
    sections: drawerSections,
    footer: {
      content: '<button class="bs-logout-btn" id="logout-btn" type="button">' + t('nav.logout') + '</button>',
      onInit: function () {
        var b = document.getElementById('logout-btn');
        if (b) b.addEventListener('click', signOut);
      },
    },
  });
}
