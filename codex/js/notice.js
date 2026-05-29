// js/notice.js
// Shared Codex notice system. The rule (Elder): every caught error is logged to
// the debug pill; the USER only sees a notice when it is actionable by them.
// Internal/dev errors go to the pill ONLY (notice.internal), never a user toast.
//
//   notice.ok(msg)        transient green confirmation ("Item salvo")
//   notice.info(msg)      transient neutral info
//   notice.warn(msg)      PERSISTENT amber, user must close it; for actionable
//                         guidance (share the doc, type in use, fix the title)
//   notice.error(msg)     PERSISTENT red, user must close it; for actionable errors
//   notice.internal(err)  pill ONLY, no user UI; for internal/dev failures
//
// Globals (optional, shared Backstage debug pill): window.bsLog, window.dbg
import { glyphSvg } from './glyphs.js';

let _host = null;
function _ensureHost() {
  if (_host && document.body && document.body.contains(_host)) return _host;
  _host = document.createElement('div');
  _host.className = 'cdx-notice-host';
  document.body.appendChild(_host);
  return _host;
}

const GLYPH = { ok: 'check-circle', info: 'info', warn: 'alert', error: 'alert' };

// Always route to the debug pill so no caught error is invisible.
function _pill(detail) {
  const msg = (detail && detail.message) ? detail.message : String(detail);
  if (typeof window !== 'undefined') {
    if (typeof window.bsLog === 'function') window.bsLog('codex: ' + msg, 'error');
    if (typeof window.dbg === 'function') window.dbg('error', 'codex: ' + msg);
  }
}

function _show(variant, message, opts) {
  opts = opts || {};
  const host = _ensureHost();
  const el = document.createElement('div');
  el.className = 'cdx-notice cdx-notice--' + variant;
  el.setAttribute('role', variant === 'error' ? 'alert' : 'status');
  el.innerHTML =
    '<span class="cdx-notice-glyph">' + glyphSvg(GLYPH[variant] || 'info', { size: 18 }) + '</span>' +
    '<span class="cdx-notice-msg"></span>' +
    (opts.persistent ? '<button class="cdx-notice-close" type="button" aria-label="Fechar">×</button>' : '');
  el.querySelector('.cdx-notice-msg').textContent = message; // textContent: no injection
  host.appendChild(el);
  const remove = () => { if (el.parentNode) el.parentNode.removeChild(el); };
  if (opts.persistent) {
    el.querySelector('.cdx-notice-close').addEventListener('click', remove);
  } else {
    setTimeout(remove, opts.duration || 3200);
  }
  return remove;
}

export function ok(message) { return _show('ok', message, {}); }
export function info(message) { return _show('info', message, {}); }
export function warn(message) { return _show('warn', message, { persistent: true }); }
export function error(message) { return _show('error', message, { persistent: true }); }
// Internal/dev error: pill only, no user-facing notice.
export function internal(detail) { _pill(detail); }
