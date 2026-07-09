// js/modal.js
// Shared modal primitive for Codex modules.
//
//   openModal(html, opts): append a .cdx-modal-backdrop with the given inner html.
//                            opts.disableBackdropClose (bool) disables click-outside.
//                            opts.disableEnterSubmit (bool) disables Enter->primary.
//                            Registers and self-removes its own key listener.
//                            Returns the backdrop element.
//   closeModal(bd): removes the backdrop (and its key listener).
//
// The key handler is stored on the backdrop element itself (_escHandler) so
// closeModal can always remove it without the caller tracking any cleanup array.
// It covers BOTH Escape (close) and Enter (fire the modal's primary action, a
// standardized submit-on-Enter so individual modals no longer wire their own —
// track-21). Enter is skipped when a more specific handler already consumed it
// (e.defaultPrevented, so a modal that DOES wire its own Enter never double-fires),
// when focus is in a textarea (newline), or when there is no enabled primary button.

export function openModal(html, opts) {
  opts = opts || {};
  // Remember what had focus so closeModal can restore it (a11y: keyboard and
  // screen-reader users keep their place instead of dropping focus to <body>).
  const trigger = (typeof document !== 'undefined') ? document.activeElement : null;
  const bd = document.createElement('div');
  bd.className = 'cdx-modal-backdrop';
  bd.innerHTML = html;

  if (!opts.disableBackdropClose) {
    bd.addEventListener('click', (e) => {
      if (e.target === bd) closeModal(bd);
    });
  }

  const escHandler = (e) => {
    if (e.key !== 'Escape' && e.key !== 'Enter') return;
    // Only the topmost modal responds, so a nested picker/confirm closing does not
    // also close (or submit) the modal beneath it.
    const all = document.querySelectorAll('.cdx-modal-backdrop');
    if (all.length && all[all.length - 1] !== bd) return;
    if (e.key === 'Escape') { closeModal(bd); return; }
    // Enter -> the modal's primary action (submit-on-Enter). Skip if a more specific
    // handler already handled it, if the caller opted out, if focus is in a textarea
    // (intentional newline), or if the target is outside this modal.
    if (e.defaultPrevented || opts.disableEnterSubmit) return;
    const el = e.target;
    if (!bd.contains(el)) return;
    const tag = el && el.tagName;
    if (tag === 'TEXTAREA') return;
    if (tag !== 'INPUT' && tag !== 'SELECT') return;
    const btn = bd.querySelector('.cdx-btn-primary:not([disabled])');
    if (btn) { e.preventDefault(); btn.click(); }
  };
  bd._escHandler = escHandler;
  bd._trigger = trigger;
  document.addEventListener('keydown', escHandler);

  document.body.appendChild(bd);
  const first = bd.querySelector('input,textarea,select');
  if (first) setTimeout(() => first.focus(), 60);
  return bd;
}

export function closeModal(bd) {
  const target = bd || document.querySelector('.cdx-modal-backdrop');
  if (!target) return;
  if (target._escHandler) {
    document.removeEventListener('keydown', target._escHandler);
    target._escHandler = null;
  }
  const trigger = target._trigger;
  target._trigger = null;
  if (target.parentNode) target.parentNode.removeChild(target);
  if (trigger && typeof trigger.focus === 'function') trigger.focus();
}
