// render/animsteps.js — pure helpers for the per-element reveal plan (Phase 7.1).
// Kept DOM-free so the step logic is unit-tested without a browser; player.autoSteps
// wires them to the live stage. No imports: this is the leaf of the reveal engine.

/**
 * Stable animation key for a reveal block, matching what the selection bar writes into
 * slide.build: a free asset by id ("a:<id>"), any fkey'd block ("f:<fkey>"), else null
 * (no stable identity -> always animates, cannot be toggled). `d` is the element dataset.
 */
export function animKey(d) {
  if (!d) return null;
  if (d.asset) return "a:" + d.asset;
  if (d.fkey) return "f:" + d.fkey;
  return null;
}

/**
 * The build key for a SELECTED element, by kind + ref. Mirrors animKey's format so the
 * selection bar and the step engine agree on one identity. The asset kind keys by asset
 * id; every other reveal kind (card / topic / imageSlot / roadnode) keys by its fkey ref.
 */
export function keyForSel(kind, ref) {
  return kind === "asset" ? "a:" + ref : "f:" + ref;
}

/**
 * A block is IMMEDIATE (appears at once, not its own reveal step) when slide.build marks
 * its key false. Absent build, absent key, or any other value -> the block animates as
 * before, so a deck with no `build` is byte-for-byte the current one-by-one behaviour.
 */
export function isImmediate(key, build) {
  return !!(build && key && build[key] === false);
}
