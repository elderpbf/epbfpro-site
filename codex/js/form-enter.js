// codex/js/form-enter.js
// Codex-owned global "Enter submits the nearest form" behavior, ported verbatim
// from the legacy backstage utils.js (the one piece of utils.js Codex actually
// relied on: the Settings drawer password form + any cdx form). Importing this
// module installs the document-level keydown handler once. Shift+Enter is
// preserved for textareas; consumers that want a multiline textarea to NOT submit
// stopPropagation the Enter on that element (e.g. the item creator's raw box).
//
// The selectors are kept identical to utils.js so behavior is unchanged; the
// host-card / cp- classes simply never appear on Codex pages.
//
// Exported as a pure function for tests; the side-effect install runs on import.
export function handleEnter(e) {
  if (e.key !== 'Enter') return;
  var tag = e.target.tagName;
  if (tag === 'TEXTAREA' && e.shiftKey) return;
  if (tag !== 'INPUT' && tag !== 'TEXTAREA') return;
  var parent = e.target.closest('.bs-field, .sd-section-body, .bs-auth-card, .host-card, .cp-create-session, form');
  // Not a legacy surface (e.g. a cdx modal input): LEAVE the event untouched. Calling
  // preventDefault() here unconditionally used to poison e.defaultPrevented, which the
  // shared js/modal.js submit-on-Enter reads to avoid double-firing — so a blanket
  // preventDefault silently disabled Enter->primary on every cdx modal. modal.js now
  // owns Enter for those.
  if (!parent) return;
  e.preventDefault(); // a matched legacy surface: suppress the native submit as before
  var btn = parent.querySelector('.bs-save-btn, .bs-auth-btn, .host-btn-primary, .cp-btn-primary, button[type="submit"]');
  if (btn && !btn.disabled) btn.click();
}

if (typeof document !== 'undefined') {
  document.addEventListener('keydown', handleEnter);
}
