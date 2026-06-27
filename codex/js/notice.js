// js/notice.js
// The NOTIFICATION surface for Codex — the persistent, top-right alert layer for
// things the admin must act on (and that Trilha can reuse to notify users). It is
// one of TWO shared notification modules; the other is js/toast.js, the transient
// bottom-right surface for operation STATUS (saved/created/validation). Two roles:
//   - toast (js/toast.js): "did it work?" — ephemeral, auto-dismiss, bottom.
//   - notice (this file):  "you need to act / be alerted" — persistent, top.
// Both are shared and called directly (no per-page wrapper) so behavior can't
// drift from page to page. Renders top-right as a .cdx-notice (CSS in css/codex.css).
//
// The rule (Elder): the USER only sees a notice when it is actionable by them;
// admin/technical errors go to the debug pill, not in their face. Pick by category:
//
//   notice.warn(msg)      USER-ACTIONABLE guidance — amber, PERSISTENT (close with
//                         ×): share the doc, type in use, fix the title.
//   notice.error(msg)     USER-ACTIONABLE error — red, PERSISTENT. For alerts the
//                         user must resolve (NOT quick validation — that's toast.err).
//   notice.internal(err)  ADMIN/technical failure (caught exceptions, API/AI
//                         errors). ALWAYS logged to the debug pill. ALSO shown as a
//                         transient red notice ONLY when the pill is ON
//                         (localStorage.bs_debug === '1', toggled from the topbar
//                         dev switch). Pill OFF → user sees nothing (can't act on it).
//   notice.ok / notice.info  transient green/blue (legacy primitives). Prefer
//                         toast.ok / toast.info for routine status confirmations.
//
// So: pill ON  → every error is visible (admin work / debugging).
//     pill OFF → only confirmations (toast) + user-actionable notices appear.
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

// Is the debug pill ON? (the topbar dev toggle persists localStorage.bs_debug)
function _debugOn() {
  try { return typeof localStorage !== 'undefined' && localStorage.getItem('bs_debug') === '1'; }
  catch (_) { return false; }
}

// Internal/admin error: ALWAYS goes to the debug pill. When the pill is ON
// (bs_debug==='1'), ALSO surface a transient visible notice so admin/technical
// errors aren't missed while debugging. In normal mode it stays pill-only — the
// user sees only what they can act on (Elder's rule). Transient (not persistent)
// so frequent internal errors don't pile up over the pill.
export function internal(detail) {
  _pill(detail);
  if (_debugOn()) {
    const msg = (detail && detail.message) ? detail.message : String(detail);
    _show('error', msg, { duration: 6000 });
  }
}
