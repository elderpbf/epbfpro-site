// js/modal.js
// Shared modal primitive for Codex modules.
//
//   openModal(html, opts)  — append a .cdx-modal-backdrop with the given inner html.
//                            opts.disableBackdropClose (bool) disables click-outside.
//                            Registers and self-removes its own Escape keydown listener.
//                            Returns the backdrop element.
//   closeModal(bd)         — removes the backdrop (and its Escape listener).
//
// The Escape handler is stored on the backdrop element itself (_escHandler) so
// closeModal can always remove it without the caller tracking any cleanup array.

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
    if (e.key !== 'Escape') return;
    // Only the topmost modal responds to Escape, so a nested picker/confirm
    // closing does not also close the modal beneath it.
    const all = document.querySelectorAll('.cdx-modal-backdrop');
    if (all.length && all[all.length - 1] !== bd) return;
    closeModal(bd);
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
