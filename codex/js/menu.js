// js/menu.js, a tiny shared "action menu" popover for the Codex shell. A trigger
// (a kebab / ✎ glyph button) opens a short list of actions; the menu is a fixed-
// positioned body child so it escapes any clipping list/sidebar. One menu lives at
// a time: opening another, clicking outside, Esc, scroll or resize all close it,
// and re-clicking the same trigger toggles it shut. Dependency-free.
//
// Built shared (not inline in the deck list) because every Codex list row that
// grows past one action wants the same affordance: openMenu(triggerEl, items),
// items = [{ label, danger?, onClick }]. The placement math is the pure, testable
// menuPosition() seam; the DOM glue around it is browser-only.

/** Pure: where to put a menu of size `menu` for a trigger at `anchor`, inside
 *  `viewport`. Right-aligned to the trigger and dropped below it, clamped into the
 *  viewport with `pad` margin, flipping above the trigger when it would overflow
 *  the bottom. All inputs/outputs are plain numbers, so it unit-tests headlessly. */
export function menuPosition(anchor, menu, viewport, pad = 8) {
  const { w: mw, h: mh } = menu;
  let left = anchor.right - mw;                       // right edge aligns to the trigger
  left = Math.max(pad, Math.min(left, viewport.w - mw - pad));
  let top = anchor.bottom + 4;                        // default: just below the trigger
  if (top + mh > viewport.h - pad && anchor.top - mh - 4 >= pad) {
    top = anchor.top - mh - 4;                        // not enough room below -> flip above
  }
  top = Math.max(pad, Math.min(top, viewport.h - mh - pad));
  return { left, top };
}

let _open = null; // { el, anchor, onDoc, onKey, onWin }

/** Close the currently-open menu, if any. Safe to call when nothing is open. */
export function closeMenu() {
  if (!_open) return;
  document.removeEventListener('mousedown', _open.onDoc, true);
  document.removeEventListener('keydown', _open.onKey, true);
  window.removeEventListener('resize', _open.onWin, true);
  window.removeEventListener('scroll', _open.onWin, true);
  _open.el.remove();
  _open = null;
}

/** Open an action menu under `anchorEl`. `items` is an array of
 *  { label, danger?, onClick }. Clicking the same anchor toggles it shut. */
export function openMenu(anchorEl, items) {
  if (!anchorEl || !Array.isArray(items) || !items.length) return;
  if (_open && _open.anchor === anchorEl) { closeMenu(); return; } // re-click toggles off
  closeMenu();

  const el = document.createElement('div');
  el.className = 'cdx-menu';
  el.setAttribute('role', 'menu');
  items.forEach((it) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cdx-menu-item' + (it.danger ? ' is-danger' : '');
    b.setAttribute('role', 'menuitem');
    b.textContent = it.label;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      closeMenu();
      if (typeof it.onClick === 'function') it.onClick();
    });
    el.appendChild(b);
  });
  document.body.appendChild(el);

  // Measure after it is in the DOM, then place it (fixed coords, viewport-clamped).
  const r = anchorEl.getBoundingClientRect();
  const { left, top } = menuPosition(
    { right: r.right, top: r.top, bottom: r.bottom },
    { w: el.offsetWidth, h: el.offsetHeight },
    { w: window.innerWidth, h: window.innerHeight }
  );
  el.style.left = left + 'px';
  el.style.top = top + 'px';

  // Close on any click outside the menu (the anchor itself is left to its own
  // handler, which toggles), on Esc, and on anything that moves the anchor.
  const onDoc = (e) => { if (!el.contains(e.target) && e.target !== anchorEl && !anchorEl.contains(e.target)) closeMenu(); };
  const onKey = (e) => { if (e.key === 'Escape') closeMenu(); };
  const onWin = () => closeMenu();
  document.addEventListener('mousedown', onDoc, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', onWin, true);
  window.addEventListener('scroll', onWin, true);
  _open = { el, anchor: anchorEl, onDoc, onKey, onWin };
}
