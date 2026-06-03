// js/anchored.js — position a content-width "pill" inside an overlay layer,
// centered under a trigger or centered in the layer, with horizontal-scroll
// overflow when it cannot fit. PURE math (anchorLeft) + a thin DOM applier
// (placePill). Dependency-free.
//
// Lifted unchanged from the Slides editor (content/slides/js/ui/anchored.js),
// which was written to be shared: the editor context bar and the Codex topbar
// sub-tabs (5c) use the same mechanic. Slides keeps its own copy for portability
// (it runs standalone too); this is the Codex-shell copy.

/** Clamped left offset (px) for a contentW-wide pill inside a containerW-wide
 *  layer. mode 'under' centers it on anchorCenter; otherwise centers in the
 *  layer. If it cannot fit, pins to pad (the caller's layer scrolls). */
export function anchorLeft({ containerW, contentW, anchorCenter, mode = "center", pad = 8 }) {
  const left = mode === "under" && anchorCenter != null
    ? anchorCenter - contentW / 2
    : (containerW - contentW) / 2;
  const max = containerW - contentW - pad;
  if (max <= pad) return pad;
  return Math.max(pad, Math.min(max, left));
}

/** Apply anchorLeft to a live pill inside an overlay layer. `anchorEl` (a tab /
 *  menu button) drives 'under'; omit it for 'center'. Measured against the
 *  layer's box so it works at any scale. */
export function placePill(layerEl, pillEl, { anchorEl, mode = "center", pad = 8 } = {}) {
  const lr = layerEl.getBoundingClientRect();
  let anchorCenter = null;
  if (anchorEl) {
    const ar = anchorEl.getBoundingClientRect();
    anchorCenter = ar.left + ar.width / 2 - lr.left;
  }
  pillEl.style.marginLeft = anchorLeft({
    containerW: lr.width,
    contentW: pillEl.offsetWidth,
    anchorCenter,
    mode: anchorEl ? "under" : mode,
    pad,
  }) + "px";
}
