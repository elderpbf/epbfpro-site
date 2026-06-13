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
  const bd = document.createElement('div');
  bd.className = 'cdx-modal-backdrop';
  bd.innerHTML = html;

  if (!opts.disableBackdropClose) {
    bd.addEventListener('click', (e) => {
      if (e.target === bd) closeModal(bd);
    });
  }

  const escHandler = (e) => {
    if (e.key === 'Escape') closeModal(bd);
  };
  bd._escHandler = escHandler;
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
  if (target.parentNode) target.parentNode.removeChild(target);
}
