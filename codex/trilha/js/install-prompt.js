// codex/trilha/js/install-prompt.js
// "Salvar como app": a home-screen install affordance rendered as an EXTENSION OF THE
// HERO — one continuous box, same width/surface, no divider (the hero grows upward to
// hold the invite). It opens big and, on the first interaction (scroll/tap/key), shrinks
// to a short strip (label + download glyph). It is PERSISTENT: no close button, it never
// dismisses itself; it only self-hides once the app is installed (and returns if the app
// is later uninstalled, since Chrome resumes firing beforeinstallprompt). The WHOLE bar
// is the button — a tap anywhere installs.
//
// During a live question the trilha body is hidden by nexo.js (it toggles body.cdx-tr-live);
// the bar hides with it and a centered pill takes over the topbar's empty middle. That swap
// is pure CSS keyed off body.cdx-tr-live, so there is no ordering race with nexo — the bar
// and the pill are both mounted here; the class decides which one shows.
//
// Platform behavior:
//   - Android/desktop (beforeinstallprompt available): tapping the bar/pill fires the native
//     prompt. Once installed the event stops firing, so the affordance simply never returns.
//   - iOS Safari (no programmatic install, no install-state signal): the expanded bar shows a
//     Share -> "Adicionar à Tela de Início" hint; tapping a collapsed strip re-expands it.
//
// The beforeinstallprompt/appinstalled listeners live at MODULE TOP LEVEL so no early event
// is missed. isStandalone/isIosSafari/isInstallAvailable are PURE and unit-pinned.
import { t } from '../i18n.js';
import { esc } from './utils.js';

const DISMISS_KEY = 'trilha_install_v2_dismissed'; // v2: old auto-dismiss flags are ignored
const LOGO_SRC = '/codex/trilha/icons/app-icon-192.png';

// Download glyph (arrow into a tray) for the collapsed strip and the questions pill.
const DL_GLYPH =
  '<svg class="cdx-install-glyph-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/>' +
  '</svg>';

// iOS Share glyph (box with an up arrow), matching the system affordance the hint names.
const SHARE_GLYPH =
  '<svg class="cdx-install-share-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 15V3"/><path d="m8 7 4-4 4 4"/>' +
    '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/>' +
  '</svg>';

// PURE. Already running as an installed PWA? (iOS uses navigator.standalone.)
export function isStandalone(win) {
  win = win || (typeof window !== 'undefined' ? window : undefined);
  if (!win) return false;
  const nav = win.navigator || {};
  const mm = win.matchMedia && win.matchMedia('(display-mode: standalone)');
  return !!nav.standalone || !!(mm && mm.matches);
}

// PURE. iOS Safari (the only iOS surface that offers Add to Home Screen) and NOT another
// iOS browser or a common in-app webview (Instagram/Facebook/WhatsApp) that cannot install.
export function isIosSafari(nav) {
  nav = nav || (typeof navigator !== 'undefined' ? navigator : undefined);
  if (!nav) return false;
  const ua = nav.userAgent || '';
  const iOS = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints || 0) > 1);
  if (!iOS) return false;
  if (!/WebKit/.test(ua)) return false;
  if (/(CriOS|FxiOS|EdgiOS|OPiOS|GSA|FBAN|FBAV|Instagram|Line|WhatsApp)/.test(ua)) return false;
  return true;
}

// Module-level capture so no beforeinstallprompt is lost between import and mount.
let _deferred = null;
let _installed = false;
let _onChange = null; // set by initInstallPrompt: (mode) => void, mode 'prompt' | 'installed'

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _deferred = e;
    if (window.bsLog) window.bsLog('pwa: beforeinstallprompt disparou', 'info');
    if (_onChange) _onChange('prompt');
  });
  window.addEventListener('appinstalled', () => {
    _deferred = null;
    _installed = true;
    if (_onChange) _onChange('installed');
  });
}

// PURE-ish. Is an install affordance meaningful right now? (Native prompt queued, or iOS
// Safari.) False once installed or already running standalone.
export function isInstallAvailable(win) {
  win = win || (typeof window !== 'undefined' ? window : undefined);
  if (!win || _installed || isStandalone(win)) return false;
  return !!_deferred || isIosSafari(win.navigator);
}

// Register the minimal service worker (scope /trilha/). Chrome fires beforeinstallprompt
// ONLY when a SW with a fetch handler is present, so without this the install bar never
// appears on Chrome. Idempotent; failures are non-fatal (browser-menu install still works).
let _swTried = false;
function registerSW(win) {
  if (_swTried) return;
  _swTried = true;
  const nav = win && win.navigator;
  if (!nav || !('serviceWorker' in nav)) return;
  try {
    nav.serviceWorker.register('/trilha/sw.js', { scope: '/trilha/' })
      .then(() => { if (win.bsLog) win.bsLog('pwa: service worker registrado', 'info'); })
      .catch((e) => { if (win.bsLog) win.bsLog('pwa: sw falhou: ' + (e && e.message || e), 'error'); });
  } catch (e) { if (win.bsLog) win.bsLog('pwa: sw erro: ' + (e && e.message || e), 'error'); }
}

// First user interaction (scroll / pointer / key). Fires once, then self-removes. Returns a
// disarm fn so a re-expand can re-arm a fresh collapse. Capture phase so a tap on the bar
// still counts. Kept module-local (not exported) — the DOM path is verified on staging.
function onFirstInteraction(win, fn) {
  let done = false;
  const run = () => { if (done) return; done = true; cleanup(); fn(); };
  const cleanup = () => {
    win.removeEventListener('scroll', run, true);
    win.removeEventListener('pointerdown', run, true);
    win.removeEventListener('keydown', run, true);
  };
  win.addEventListener('scroll', run, true);
  win.addEventListener('pointerdown', run, true);
  win.addEventListener('keydown', run, true);
  return cleanup;
}

// The single live UI, module-scoped so a second init (or the gear "recover") re-expands the
// existing bar instead of mounting a duplicate. Null until first render, and after teardown.
let _ui = null;

// Mount the install bar (if installable). Idempotent: a second call re-expands rather than
// duplicating. Renders NOTHING if installed / standalone / not installable.
export function initInstallPrompt(root, opts = {}) {
  const win = opts.win || (typeof window !== 'undefined' ? window : undefined);
  if (!win || !root) return;
  registerSW(win); // must run even if we don't render, so beforeinstallprompt can fire
  if (_installed || isStandalone(win)) return;

  // Already mounted and still in the DOM → just bring it big again.
  if (_ui && _ui.bar && _ui.bar.isConnected) { _ui.expand(); return; }
  _ui = null;

  const doc = win.document;
  if (!doc) return;
  const host = root.querySelector('.cdx-trilha-main') || root;
  const hero = root.querySelector('.cdx-trilha-hero');

  let bar = null;
  let pill = null;
  let disarm = null;
  let mode = 'prompt'; // 'prompt' (native) | 'ios'

  function collapse() { if (bar) bar.classList.add('is-min'); }
  function armCollapse() {
    if (disarm) { disarm(); disarm = null; }
    disarm = onFirstInteraction(win, collapse);
  }
  function expand() {
    if (!bar) return;
    bar.classList.remove('is-min');
    armCollapse();
  }

  // A tap anywhere on the bar/pill installs. On iOS there is no programmatic install, so a
  // tap on a collapsed strip just re-expands to reveal the Share hint (the expanded bar
  // carries the instructions); an expanded iOS bar tap is a no-op (nothing to fire).
  function doInstall() {
    if (mode === 'ios') { if (bar && bar.classList.contains('is-min')) expand(); return; }
    if (!_deferred) { expand(); return; }
    _deferred.prompt();
    Promise.resolve(_deferred.userChoice).catch(() => {}).then(() => { _deferred = null; });
  }

  function teardown() {
    if (disarm) { disarm(); disarm = null; }
    if (bar) { bar.remove(); bar = null; }
    if (pill) { pill.remove(); pill = null; }
    if (hero) hero.classList.remove('cdx-install-joined');
    _ui = null;
  }

  function render(m) {
    if (bar || isStandalone(win)) return;
    mode = m;
    const ios = (m === 'ios');
    const descHtml = ios
      ? SHARE_GLYPH + '<span>' + esc(t('install.ios_hint')) + '</span>'
      : esc(t('install.cta_desc'));
    const cta = ios ? '' : '<span class="cdx-install-cta">' + esc(t('install.btn')) + '</span>';

    bar = doc.createElement('div');
    bar.className = 'cdx-install-bar';
    bar.setAttribute('role', 'button');
    bar.setAttribute('tabindex', '0');
    bar.innerHTML =
      '<img class="cdx-install-logo" src="' + LOGO_SRC + '" alt="" width="40" height="40">' +
      '<div class="cdx-install-body">' +
        '<span class="cdx-install-title">' + esc(t('install.cta_title')) + '</span>' +
        '<span class="cdx-install-desc">' + descHtml + '</span>' +
      '</div>' +
      '<span class="cdx-install-minlabel">' + esc(t('install.pill')) + '</span>' +
      cta +
      '<span class="cdx-install-glyph">' + DL_GLYPH + '</span>';
    host.prepend(bar);
    if (hero) hero.classList.add('cdx-install-joined');

    bar.addEventListener('click', doInstall);
    bar.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); doInstall(); }
    });

    // Questions-state pill: centered over the topbar, shown only while body.cdx-tr-live
    // (nexo's live-question takeover). Solid teal + white text for contrast in both themes.
    pill = doc.createElement('button');
    pill.type = 'button';
    pill.className = 'cdx-install-qpill';
    pill.innerHTML =
      '<img class="cdx-install-qpill-logo" src="' + LOGO_SRC + '" alt="" width="20" height="20">' +
      '<span>' + esc(t('install.pill')) + '</span>';
    pill.addEventListener('click', doInstall);
    doc.body.appendChild(pill);

    _ui = { bar, pill, expand, teardown };
    armCollapse();
  }

  // On install, tear down (do NOT persist a flag): once installed Chrome stops firing
  // beforeinstallprompt so it won't reappear; and if the user later uninstalls, the invite
  // should return (a persisted flag would wrongly suppress it forever).
  _onChange = (m) => { if (m === 'installed') teardown(); else if (!bar) render('prompt'); };

  if (_deferred) render('prompt');
  else if (isIosSafari(win.navigator)) render('ios');
}

// Bring the invite back big (e.g. from the settings gear). Clears the legacy dismiss flag and
// re-expands the existing bar, or mounts it if it isn't up yet.
export function showInstallPrompt(root, opts = {}) {
  const win = opts.win || (typeof window !== 'undefined' ? window : undefined);
  if (win) { try { win.localStorage.removeItem(DISMISS_KEY); } catch (_) { /* private mode */ } }
  if (_ui && _ui.bar && _ui.bar.isConnected) { _ui.expand(); return; }
  initInstallPrompt(root, opts);
}
