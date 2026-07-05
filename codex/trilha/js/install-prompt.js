// codex/trilha/js/install-prompt.js
// "Salvar como app": a dismissable card that lets a student install the Trilha as a
// PWA on the home screen (Android/desktop via the native prompt; iOS Safari via a
// Share -> Adicionar à Tela de Início hint, since iOS has no programmatic prompt).
//
// The beforeinstallprompt/appinstalled listeners live at MODULE TOP LEVEL (registered
// the moment page.js imports this file), because Chrome fires beforeinstallprompt early
// and once; a listener attached later inside initInstallPrompt() would miss it. The
// captured event is stashed and replayed to the UI when initInstallPrompt() mounts.
//
// isStandalone/isIosSafari are PURE and unit-pinned; the DOM card is verified on staging.
import { t } from '../i18n.js';
import { esc } from './utils.js';

const DISMISS_KEY = 'trilha_install_dismissed';

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
// Best-effort by UA; iPadOS reports as Macintosh with touch, handled explicitly.
export function isIosSafari(nav) {
  nav = nav || (typeof navigator !== 'undefined' ? navigator : undefined);
  if (!nav) return false;
  const ua = nav.userAgent || '';
  const iOS = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints || 0) > 1);
  if (!iOS) return false;
  if (!/WebKit/.test(ua)) return false;
  // Other iOS browsers + in-app webviews can't A2HS -> don't show a hint that won't work.
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

// Mount the install card into the trilha, if installable and not already dismissed.
// Idempotent: a second call while a card is up is a no-op.
export function initInstallPrompt(root, opts = {}) {
  const win = opts.win || (typeof window !== 'undefined' ? window : undefined);
  if (!win || !root) return;
  if (_installed || isStandalone(win)) return;
  try { if (win.localStorage.getItem(DISMISS_KEY) === '1') return; } catch (_) { /* private mode: just proceed */ }

  const host = root.querySelector('.cdx-trilha-main') || root;
  const doc = win.document;
  let card = null;

  function remove(persist) {
    if (card) { card.remove(); card = null; }
    if (persist) { try { win.localStorage.setItem(DISMISS_KEY, '1'); } catch (_) { /* ignore */ } }
  }

  function render(mode) {
    if (card || isStandalone(win) || !doc) return; // one card at a time
    const action = (mode === 'ios')
      ? '<p class="cdx-install-hint">' + SHARE_GLYPH + '<span>' + esc(t('install.ios_hint')) + '</span></p>'
      : '<button type="button" class="cdx-install-btn">' + esc(t('install.btn')) + '</button>';
    card = doc.createElement('div');
    card.className = 'cdx-install-card';
    card.innerHTML =
      '<div class="cdx-install-body">' +
        '<strong class="cdx-install-title">' + esc(t('install.cta_title')) + '</strong>' +
        '<span class="cdx-install-desc">' + esc(t('install.cta_desc')) + '</span>' +
        '<div class="cdx-install-actions">' + action + '</div>' +
      '</div>' +
      '<button type="button" class="cdx-install-close" aria-label="' + esc(t('install.dismiss')) + '">&times;</button>';
    host.prepend(card);

    card.querySelector('.cdx-install-close').addEventListener('click', () => remove(true));
    const btn = card.querySelector('.cdx-install-btn');
    if (btn) btn.addEventListener('click', async () => {
      if (!_deferred) { remove(false); return; }
      btn.disabled = true;
      _deferred.prompt();
      try { await _deferred.userChoice; } catch (_) { /* ignore */ }
      _deferred = null;
      remove(false); // hide now; appinstalled (if accepted) persists the dismissal
    });
  }

  // React to events that arrive after mount, too.
  _onChange = (mode) => { if (mode === 'installed') remove(true); else render('prompt'); };

  // Replay whatever we already have.
  if (_deferred) render('prompt');
  else if (isIosSafari(win.navigator)) render('ios');
}
