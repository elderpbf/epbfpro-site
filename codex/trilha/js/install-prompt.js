// codex/trilha/js/install-prompt.js
// "Salvar como app": a home-screen install affordance that opens as a full card and,
// after a few seconds, shrinks to a small logo pill at the top of the trilha. Tapping
// the pill re-expands it. Every page open starts expanded, then collapses.
//
// Platform behavior:
//   - Android/desktop (beforeinstallprompt available): the native prompt via a button.
//     No close button — once the app is installed the browser stops firing the event, so
//     the affordance simply never shows again (self-hiding), and the small pill is harmless.
//   - iOS Safari (no programmatic install, no install-state signal): a Share -> Adicionar
//     à Tela de Início hint, WITH a close button (persisted), since we cannot auto-detect
//     that it was installed. showInstallPrompt() brings it back after a dismiss.
//
// The beforeinstallprompt/appinstalled listeners live at MODULE TOP LEVEL so no early
// event is missed. isStandalone/isIosSafari/isInstallAvailable are PURE and unit-pinned.
import { t } from '../i18n.js';
import { esc } from './utils.js';

const DISMISS_KEY = 'trilha_install_dismissed';
const COLLAPSE_MS = 5000;
const LOGO_SRC = '/codex/trilha/icons/app-icon-192.png';

// iOS Share glyph (box with an up arrow), matching the system affordance the hint names.
const SHARE_GLYPH =
  '<svg class="cdx-install-glyph" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ' +
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

// Mount the install card (if installable and not previously dismissed). Idempotent.
export function initInstallPrompt(root, opts = {}) {
  const win = opts.win || (typeof window !== 'undefined' ? window : undefined);
  if (!win || !root) return;
  if (_installed || isStandalone(win)) return;
  try { if (win.localStorage.getItem(DISMISS_KEY) === '1') return; } catch (_) { /* private mode */ }

  const host = root.querySelector('.cdx-trilha-main') || root;
  const doc = win.document;
  let card = null;
  let collapseTimer = null;

  function scheduleCollapse() {
    if (collapseTimer) win.clearTimeout(collapseTimer);
    collapseTimer = win.setTimeout(() => { if (card) card.classList.add('is-collapsed'); }, COLLAPSE_MS);
  }
  function remove(persist) {
    if (collapseTimer) { win.clearTimeout(collapseTimer); collapseTimer = null; }
    if (card) { card.remove(); card = null; }
    if (persist) { try { win.localStorage.setItem(DISMISS_KEY, '1'); } catch (_) { /* ignore */ } }
  }

  function render(mode) {
    if (card || isStandalone(win) || !doc) return;
    const ios = (mode === 'ios');
    const action = ios
      ? '<p class="cdx-install-hint">' + SHARE_GLYPH + '<span>' + esc(t('install.ios_hint')) + '</span></p>'
      : '<button type="button" class="cdx-install-btn">' + esc(t('install.btn')) + '</button>';
    // Close (X) only where we cannot detect an install (iOS). On Android/desktop the
    // affordance self-hides once installed, so no manual dismiss is needed.
    const close = ios
      ? '<button type="button" class="cdx-install-close" aria-label="' + esc(t('install.dismiss')) + '">&times;</button>'
      : '';
    card = doc.createElement('div');
    card.className = 'cdx-install-card';
    card.innerHTML =
      '<img class="cdx-install-logo" src="' + LOGO_SRC + '" alt="" width="40" height="40">' +
      '<span class="cdx-install-pill-label">' + esc(t('install.pill')) + '</span>' +
      '<div class="cdx-install-body">' +
        '<strong class="cdx-install-title">' + esc(t('install.cta_title')) + '</strong>' +
        '<span class="cdx-install-desc">' + esc(t('install.cta_desc')) + '</span>' +
        '<div class="cdx-install-actions">' + action + '</div>' +
      '</div>' + close;
    host.prepend(card);

    // Tapping the collapsed pill re-expands it (ignoring the X).
    card.addEventListener('click', (e) => {
      if (card.classList.contains('is-collapsed') && !e.target.closest('.cdx-install-close')) {
        card.classList.remove('is-collapsed');
        scheduleCollapse();
      }
    });
    const btn = card.querySelector('.cdx-install-btn');
    if (btn) btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!_deferred) { remove(false); return; }
      btn.disabled = true;
      _deferred.prompt();
      try { await _deferred.userChoice; } catch (_) { /* ignore */ }
      _deferred = null;
      remove(false); // appinstalled persists the dismissal if accepted
    });
    const x = card.querySelector('.cdx-install-close');
    if (x) x.addEventListener('click', (e) => { e.stopPropagation(); remove(true); });

    scheduleCollapse();
  }

  _onChange = (mode) => { if (mode === 'installed') remove(true); else if (!card) render('prompt'); };

  if (_deferred) render('prompt');
  else if (isIosSafari(win.navigator)) render('ios');
}

// Bring the card back after a dismiss (e.g. from a settings entry). Clears the flag.
export function showInstallPrompt(root, opts = {}) {
  const win = opts.win || (typeof window !== 'undefined' ? window : undefined);
  if (win) { try { win.localStorage.removeItem(DISMISS_KEY); } catch (_) { /* ignore */ } }
  initInstallPrompt(root, opts);
}
