// codex/js/clamp.js
// "Texto grande vira janela, não parede" (Élder 2026-07-15): a block that would run for
// screens is capped at a readable height and opens on a click, closing on the next one.
//
// Only text that ACTUALLY overflows becomes clickable. That is measured after paint
// (scrollHeight vs clientHeight) instead of guessed from a character count, because a
// character count is wrong the moment the font, the viewport width or the language changes,
// and a "toque para ver tudo" hint over a two-line answer is a lie the student clicks once
// and stops trusting.
//
// Styling lives in css/components.css (.cdx-clamp), so every surface that clamps looks the
// same. Shared on purpose: the student card clamps answers today, and any pane showing
// free text has the same problem.

const CLS = 'cdx-clamp';

// Is there a live text selection sitting inside `el`? Guarded for non-browser hosts and for
// engines where getSelection returns null in a detached document.
function _hasSelectionIn(el) {
  try {
    if (typeof getSelection !== 'function') return false;
    const sel = getSelection();
    if (!sel || sel.isCollapsed || !String(sel)) return false;
    const node = sel.anchorNode;
    return !!node && el.contains(node.nodeType === 1 ? node : node.parentNode);
  } catch (_) { return false; }
}

// Clamp every `selector` under `root`. Idempotent per element (a repaint re-runs it on
// fresh nodes; an already-wired node is skipped). Returns the count actually clamped.
export function wireClamps(root, selector) {
  if (!root || !root.querySelectorAll) return 0;
  let n = 0;
  root.querySelectorAll(selector).forEach((el) => {
    if (el.dataset && el.dataset.cdxClamp) return;   // already wired
    el.classList.add(CLS);
    // The class must be ON before this reads: the cap is what creates the overflow to detect.
    if (el.scrollHeight <= el.clientHeight + 2) { el.classList.remove(CLS); return; }
    if (el.dataset) el.dataset.cdxClamp = '1';
    el.classList.add('is-clampable');
    el.addEventListener('click', (e) => {
      if (e && e.stopPropagation) e.stopPropagation();   // never collapse the card behind it
      // Selecting text ENDS in a click. Once the block is open it is text again: the student
      // may be marking their own answer to copy it, and collapsing it under their finger the
      // moment they finish selecting is the opposite of helpful. Closed, there is nothing to
      // select (CSS turns selection off), so the tap is unambiguously "open this".
      if (el.classList.contains('is-open') && _hasSelectionIn(el)) return;
      el.classList.toggle('is-open');
    });
    n += 1;
  });
  return n;
}
