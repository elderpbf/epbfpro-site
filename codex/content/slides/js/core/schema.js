// core/schema.js — pure data helpers, deck/slide geometry. No DOM, no imports.

export const uid = () => Math.random().toString(36).slice(2, 9);

/** Design canvas: all coordinates (assets + freeform overrides) live in this space. */
export const CANVAS = { w: 1280, h: 720 };

/** Deck-level logo default (top-left). Single source so deck/render/geometry agree. */
export const DEFAULT_LOGO = { x: 40, y: 30, h: 40 };

/** Read a dotted path from an object (safe). */
export function getByPath(obj, path) {
  return path.split(".").reduce((x, k) => (x == null ? x : x[k]), obj);
}

/** Write a dotted path into an object (parents must exist). */
export function setPath(obj, path, value) {
  const parts = path.split(".");
  let x = obj;
  for (let i = 0; i < parts.length - 1; i++) x = x[parts[i]];
  x[parts[parts.length - 1]] = value;
}

/** Structured deep clone of plain deck JSON. */
export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Resolve a `"<list>.<id>"` style ref (e.g. "cards.k1", "topics.t3") to the item
 * object inside slide.slots, so per-item text style can live ON the object (the
 * same home asset.style uses) and survive reorder. Returns null if unresolvable.
 */
export function resolveStyleObj(slots, ref) {
  if (!ref) return null;
  const dot = ref.indexOf(".");
  if (dot < 0) return null;
  const arr = slots && slots[ref.slice(0, dot)];
  if (!Array.isArray(arr)) return null;
  const id = ref.slice(dot + 1);
  return arr.find((x) => x && x.id === id) || null;
}

/**
 * Deck schema version. Bumped when the on-disk shape changes so migrateDeck can
 * run a one-time upgrade and never re-run it. v2 = D1 stable identity:
 * cards carry an id, topics are {id,text}, geometry overrides + per-item text
 * style are keyed/stored by identity, not array position.
 * v3 = explicit step field on revealable items (topics + cards): integer where
 * 0 = always shown and 1..N = reveal order; derived from array position on first
 * migration so existing decks render identically.
 */
export const SCHEMA_VERSION = 3;

/**
 * Upgrade a deck in place to the current schema (idempotent, version-gated).
 *
 * Always ensures every card has a stable `id` and every topic is a {id,text}
 * object (so freshly loaded OR freshly created slides are well-formed). The
 * one-shot part (only when the deck predates v2) re-points positional geometry
 * overrides — `cards.<i>` / `topics.<i>` — to identity keys `cards.<id>` /
 * `topics.<id>` (the value the element renders as its data-fkey), and moves
 * positional per-item text style off slide.textStyle[`cards.<i>.text`] /
 * [`topics.<i>`] onto the object's own `.style` (asset.style's home). A
 * positional key and an id key are both strings, so the re-point CANNOT be told
 * apart after the fact: it is gated on the stored version, never structure.
 */
export function migrateDeck(deck) {
  if (!deck) return deck;
  const from = deck.schemaVersion || 1;
  const repoint = from < 2; // the one-shot positional -> identity remap
  const addSteps = from < 3; // one-shot: assign step=i+1 to items lacking it

  for (const slide of deck.slides || []) {
    const slots = slide.slots || {};
    const ov = (slide.overrides = slide.overrides || {});
    const ts = slide.textStyle || {};

    if (Array.isArray(slots.cards)) {
      slots.cards.forEach((c, i) => {
        if (!c) return;
        if (c.id == null) c.id = uid();
        if (repoint) {
          moveKey(ov, `cards.${i}`, `cards.${c.id}`);
          moveStyle(ts, `cards.${i}.text`, c);
        }
        if (addSteps && c.step == null) c.step = i + 1;
      });
    }

    if (Array.isArray(slots.topics)) {
      slots.topics = slots.topics.map((t, i) => {
        const obj = t && typeof t === "object" ? t : { id: uid(), text: t == null ? "" : String(t) };
        if (obj.id == null) obj.id = uid();
        if (repoint) {
          moveKey(ov, `topics.${i}`, `topics.${obj.id}`);
          moveStyle(ts, `topics.${i}`, obj);
        }
        if (addSteps && obj.step == null) obj.step = i + 1;
        return obj;
      });
    }

    if (Object.keys(ts).length) slide.textStyle = ts;
    else delete slide.textStyle; // drop an emptied style map rather than leave {}
  }

  deck.schemaVersion = SCHEMA_VERSION;
  return deck;
}

/** Move an override entry from a positional key to an identity key (if present). */
function moveKey(map, oldKey, newKey) {
  if (oldKey === newKey || map[oldKey] == null) return;
  map[newKey] = map[oldKey];
  delete map[oldKey];
}

/** Move a positional text-style entry onto the item object's own .style. */
function moveStyle(ts, oldKey, obj) {
  if (ts[oldKey] == null) return;
  obj.style = ts[oldKey];
  delete ts[oldKey];
}
