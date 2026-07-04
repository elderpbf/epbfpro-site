// render/animsteps.js — pure, DOM-free core of the per-slide animation plan (Phase 7).
// player.autoSteps extracts the ordered blocks from the stage and calls planSteps; the
// selection controls read/mutate slide.build through the small helpers here. No imports.
//
// MODEL — slide.build is an ORDERED array of unit keys, in reveal order:
//   "a:<assetId>"   a free-placed asset (reveals as one unit)
//   "f:<fkey>"      a single slot: a filled image, or a free text box
//   "each:<list>"   a whole list/deck (topics, cards, …): one step PER item, in item order
//   "unit:<list>"   a whole list/deck: ALL its items reveal together in ONE step
// A key ABSENT from the array is immediate (appears with the fixed content, no step).
// build === undefined  -> AUTO: every default-animated block, one-by-one, in DOM order
//                         (the validated default; a deck with no build is unchanged).
// build === [] (array) -> EXPLICIT and empty: nothing animates. Presence, not length,
//                         decides explicit vs auto, so "animate nothing" is representable.

/** Singleton key for a selected element by kind: a free asset by id, else by fkey. */
export function singletonKey(kind, ref) {
  return kind === "asset" ? "a:" + ref : "f:" + ref;
}

/** Key for a whole list/deck at the given mode ("each" | "unit"). */
export function listKey(list, mode) {
  return (mode === "unit" ? "unit:" : "each:") + list;
}

/** Parse a list key back to { list, mode }, or null if it is a singleton key. */
export function parseListKey(k) {
  if (typeof k !== "string") return null;
  if (k.startsWith("each:")) return { list: k.slice(5), mode: "each" };
  if (k.startsWith("unit:")) return { list: k.slice(5), mode: "unit" };
  return null;
}

/**
 * The reveal plan. `els` is the DOM-order array of block descriptors:
 *   list item   -> { list: "<name>", key: null, def: true }
 *   singleton   -> { list: null, key: "a:.."|"f:..", def: <boolean> }
 * `def` is whether the block animates in AUTO mode (blocks yes, free text boxes no, so
 * titles stay fixed). Returns { steps, count }: steps[i] is the 1-based reveal step of
 * els[i] (0 = immediate/fixed), count is the slide's max step.
 */
export function planSteps(els, build) {
  const steps = els.map(() => 0);
  let n = 0;
  if (!build) {
    els.forEach((e, i) => { if (e.def) steps[i] = ++n; });
    return { steps, count: n };
  }
  for (const k of build) {
    const lk = parseListKey(k);
    if (lk) {
      const idxs = [];
      els.forEach((e, i) => { if (e.list === lk.list) idxs.push(i); });
      if (!idxs.length) continue;
      if (lk.mode === "unit") { const s = ++n; idxs.forEach((i) => (steps[i] = s)); }
      else idxs.forEach((i) => { steps[i] = ++n; });
    } else {
      const i = els.findIndex((e) => e.key === k);
      if (i >= 0) steps[i] = ++n;
    }
  }
  return { steps, count: n };
}

/**
 * Materialize the implicit AUTO order into an explicit build, so a first edit does not
 * blank the slide. Each list contributes ONE "each:<list>" at its first item; each
 * default-animated singleton contributes its key; free text boxes (def false) are left
 * out (fixed by default, opted in later). Order follows DOM order.
 */
export function seedBuild(els, includeAll = false) {
  const out = [];
  const seen = new Set();
  for (const e of els) {
    if (e.list) {
      if (!seen.has(e.list)) { seen.add(e.list); out.push("each:" + e.list); }
    } else if ((e.def || includeAll) && e.key) {
      out.push(e.key); // includeAll also animates free text boxes ("ligar todos")
    }
  }
  return out;
}

/** Move a key one slot earlier (dir -1) / later (dir +1). Returns a NEW array. */
export function moveKey(build, key, dir) {
  const b = build.slice();
  const i = b.indexOf(key);
  if (i < 0) return b;
  const j = i + dir;
  if (j < 0 || j >= b.length) return b;
  [b[i], b[j]] = [b[j], b[i]];
  return b;
}

/** A list's mode in build: "each" | "unit" | "none". AUTO (no build) reads as "each". */
export function listModeOf(build, list) {
  if (!build) return "each";
  for (const k of build) { const lk = parseListKey(k); if (lk && lk.list === list) return lk.mode; }
  return "none";
}

/** The exact key a list currently occupies in build (each:/unit:), or null. */
export function keyOfList(build, list) {
  if (!build) return null;
  for (const k of build) { const lk = parseListKey(k); if (lk && lk.list === list) return k; }
  return null;
}

/** Whether a singleton animates: its build membership, or its AUTO default when no build. */
export function isAnimated(build, key, def) {
  return build ? build.includes(key) : def;
}
