// Codex admin connection watchdog.
//
// Every backend call funnels through one place (js/worker-call.js, which calls
// window.cdxNet). When the network drops while the tab sits idle, the next call
// fails as a TRANSPORT error (not an application error the Worker returned on
// purpose) and we raise a single, non-blocking banner offering a reload. As soon
// as any call succeeds again, the banner clears itself, so a brief blip self-heals
// without a click. The browser's own online/offline events drive the same two
// signals, so a sleeping laptop that wakes offline shows the banner immediately.
//
// Admin-only: the boot calls install(); the public Trail never does, so it stays
// silent there. Split for node --test: isConnectivityError is the pure decision
// (transport failure vs. a deliberate Worker error); the banner is the thin DOM
// shell around it.

import { t } from './i18n.js';

// PURE. Only a transport/connectivity failure should raise the banner — never an
// application error the Worker returned deliberately (e.g. 'invalid status' or an
// HTTP status), which proves the connection is actually fine.
export function isConnectivityError(errData) {
  if (!errData) return false;
  const code = errData.error || '';
  return code === 'network_error' || code === 'body_read_error';
}

let _down = false;
let _banner = null;

function _build() {
  const el = document.createElement('div');
  el.className = 'cdx-reconnect';
  el.setAttribute('role', 'alert');

  const msg = document.createElement('span');
  msg.className = 'cdx-reconnect-msg';
  msg.textContent = t('net.lost');

  const reload = document.createElement('button');
  reload.type = 'button';
  reload.className = 'cdx-reconnect-reload';
  reload.textContent = t('net.reload');
  reload.addEventListener('click', () => { try { location.reload(); } catch (_) { /* ignore */ } });

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'cdx-reconnect-dismiss';
  dismiss.setAttribute('aria-label', t('net.dismiss'));
  dismiss.textContent = '×';
  dismiss.addEventListener('click', () => _hide());

  el.appendChild(msg);
  el.appendChild(reload);
  el.appendChild(dismiss);
  return el;
}

function _show() {
  if (typeof document === 'undefined') return;
  if (!_banner) {
    _banner = _build();
    document.body.appendChild(_banner);
  }
  // Next tick so the entrance transition runs (mirrors js/toast.js).
  setTimeout(() => { if (_banner) _banner.classList.add('show'); }, 10);
}

function _hide() {
  if (!_banner) return;
  const el = _banner;
  _banner = null;
  el.classList.remove('show');
  setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 300);
}

// Raise the banner on a genuine transport failure. Idempotent while already down.
export function signalDown(errData) {
  if (!isConnectivityError(errData)) return;
  if (_down) return;
  _down = true;
  _show();
}

// Clear the banner once the connection is proven alive again. No-op if up.
export function signalUp() {
  if (!_down) return;
  _down = false;
  _hide();
}

// Wire the transport hook + the browser's own connectivity events. Idempotent:
// a second call (or a Trail page that never calls it) is harmless.
export function install() {
  if (typeof window === 'undefined') return;
  if (window.cdxNet) return;
  window.cdxNet = (state, data) => {
    if (state === 'up') return signalUp();
    if (state === 'down') return signalDown(data);
  };
  window.addEventListener('online', signalUp);
  window.addEventListener('offline', () => signalDown({ error: 'network_error' }));
}
