// js/toast.js
// THE transient status surface for all of Codex. Ephemeral, bottom-right, auto-
// dismiss. It reports the STATUS of an operation the user just did — saved,
// created, deleted, or a quick validation that failed. It is NOT a notification
// surface: alerts the admin must act on (and that Trilha can reuse for users)
// live in the persistent top-right notice surface (js/notice.js). Two surfaces,
// two roles, both shared modules so behavior never drifts from one page to
// another — import and call directly, no per-page wrapper.
//
//   toast.ok(msg)    success / confirmation — green  ("Turma salva")
//   toast.err(msg)   operation / validation failed — red ("CPF inválido")
//   toast.info(msg)  neutral status — blue ("Link copiado")
//
// Look (bg/color) + layout (bottom-right, animation) live in the .cdx-toast*
// rules in css/components.css. The bottom offset clears the debug pill.

// Errors dwell longer than confirmations so a validation message stays readable
// (the original complaint), without becoming a persistent banner.
var DWELL = { success: 2500, info: 2500, danger: 4000 };

function _show(msg, type) {
  if (typeof document === 'undefined') return;
  var el = document.createElement('div');
  el.className = 'cdx-toast cdx-toast-' + type;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(function () { el.classList.add('show'); }, 10);
  setTimeout(function () {
    el.classList.remove('show');
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 300);
  }, DWELL[type] || 2500);
}

export function ok(msg)   { _show(msg, 'success'); }
export function err(msg)  { _show(msg, 'danger'); }
export function info(msg) { _show(msg, 'info'); }
