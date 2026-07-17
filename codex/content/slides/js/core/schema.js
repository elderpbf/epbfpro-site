// core/schema.js — pure data helpers, deck/slide geometry. No DOM, no imports.

export const uid = () => Math.random().toString(36).slice(2, 9);

/** Design canvas: all coordinates (assets + freeform overrides) live in this space. */
export const CANVAS = { w: 1280, h: 720 };

/**
 * Selectable deck aspect ratios -> design-canvas dimensions. Height stays 720 so font
 * sizes and line metrics are stable across ratios; only the width changes, so a 4:3
 * deck is a NARROWER canvas, not a shorter one. 16:9 is the historical canvas (CANVAS).
 */
export const ASPECTS = { "16:9": { w: 1280, h: 720 }, "4:3": { w: 960, h: 720 } };

/** Canvas dims (a fresh object) for an aspect key, defaulting to 16:9. */
export function canvasForAspect(aspect) {
  return { ...(ASPECTS[aspect] || ASPECTS["16:9"]) };
}

/** Infer the aspect key from a stored canvas (legacy decks carry a canvas, no aspect). */
export function aspectOfCanvas(canvas) {
  if (!canvas || !canvas.w || !canvas.h) return "16:9";
  for (const k in ASPECTS) if (ASPECTS[k].w === canvas.w && ASPECTS[k].h === canvas.h) return k;
  return Math.abs(canvas.w / canvas.h - 4 / 3) < 0.05 ? "4:3" : "16:9";
}

/**
 * Re-anchor a deck's ABSOLUTE-positioned geometry when the canvas is resized, so nothing
 * lands off the new canvas: freeform overrides, free assets and the deck logo scale by
 * (sx,sy). Flow content reflows on its own and is left untouched. Pure: mutates + returns
 * the deck. `sx = newW/oldW`, `sy = newH/oldH`.
 */
export function reanchorDeck(deck, sx, sy) {
  if (!deck || (sx === 1 && sy === 1)) return deck;
  const scaleBox = (g) => {
    if (!g) return;
    if (g.x != null) g.x *= sx;
    if (g.y != null) g.y *= sy;
    if (g.w != null) g.w *= sx;
    if (g.h != null) g.h *= sy;
  };
  if (deck.logo) { if (deck.logo.x != null) deck.logo.x *= sx; if (deck.logo.y != null) deck.logo.y *= sy; }
  for (const a of deck.assets || []) scaleBox(a);
  for (const slide of deck.slides || []) { const ov = slide.overrides || {}; for (const k in ov) scaleBox(ov[k]); }
  return deck;
}

/** Do two {x,y,w,h} boxes overlap? Missing w/h count as 0. */
function boxesOverlap(a, b) {
  const ax2 = a.x + (a.w || 0), ay2 = a.y + (a.h || 0);
  const bx2 = b.x + (b.w || 0), by2 = b.y + (b.h || 0);
  return a.x < bx2 && ax2 > b.x && a.y < by2 && ay2 > b.y;
}

/**
 * Clamp the deck's ABSOLUTE geometry inside its canvas so nothing crosses the slide
 * border (freeform overrides, free assets, the deck logo). A slide where the clamp pushed
 * a moved element into another absolute element is flagged `reflowWarn` (else the flag is
 * cleared) so the editor can badge it "revisar". Pure: mutates + returns the deck.
 */
export function clampToCanvas(deck) {
  if (!deck || !deck.canvas) return deck;
  const { w: W, h: H } = deck.canvas;
  const moved = new Set();
  const clamp = (g) => {
    if (!g || g.x == null) return;
    const ox = g.x, oy = g.y;
    if (g.w != null && g.w > W) g.w = W;
    if (g.h != null && g.h > H) g.h = H;
    g.x = Math.max(0, Math.min(g.x, Math.max(0, W - (g.w || 0))));
    g.y = Math.max(0, Math.min(g.y, Math.max(0, H - (g.h || 0))));
    if (g.x !== ox || g.y !== oy) moved.add(g);
  };
  if (deck.logo) clamp(deck.logo);
  for (const a of deck.assets || []) clamp(a);
  for (const slide of deck.slides || []) {
    const ov = slide.overrides || {};
    for (const k in ov) clamp(ov[k]);
    const boxes = [];
    for (const k in ov) if (ov[k] && ov[k].x != null) boxes.push(ov[k]);
    for (const a of deck.assets || []) if (a.x != null && ((a.scope === "slide" && a.slideId === slide.id) || a.scope === "all")) boxes.push(a);
    let warn = false;
    for (const b of boxes) { if (!moved.has(b)) continue; for (const o of boxes) if (o !== b && boxesOverlap(b, o)) { warn = true; break; } if (warn) break; }
    if (warn) slide.reflowWarn = true; else if (slide.reflowWarn) delete slide.reflowWarn;
  }
  return deck;
}

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
 * The SHARED half of a slide: everything except what belongs to the deck holding it.
 * `id` is the deck-local slot, `ref` is the link, `name`/`from` are library-entry
 * metadata. What is left is the slide itself (layout, slots, notes, build/buildFx,
 * overrides, textStyle) and is what a linked slide has ONE of, no matter how many decks
 * or how many positions in one deck show it.
 *
 * Lives here, in the pure-data core, because BOTH sides need the same answer: the editor
 * (app.js, keeping same-ref siblings in step inside one deck) and the adapters
 * (sharedSlides/slideClip, reading and writing the library). Two definitions of "what is
 * shared" would drift, and the drift would be invisible until a slide lost a field.
 */
export function slideContent(slide) {
  const out = clone(slide);
  delete out.id;
  delete out.ref;
  delete out.name;
  delete out.from;
  delete out._broken;
  return out;
}

/**
 * Deck schema version. Bumped when the on-disk shape changes so migrateDeck can
 * run a one-time upgrade and never re-run it. v2 = D1 stable identity:
 * cards carry an id, topics are {id,text}, geometry overrides + per-item text
 * style are keyed/stored by identity, not array position.
 * v3 = explicit step field on revealable items (topics + cards): integer where
 * 0 = always shown and 1..N = reveal order; derived from array position on first
 * migration so existing decks render identically.
 * v4 = composable cards: the card `mode` (title|text|image|image-text XOR) folds
 * into an OPEN `parts` map {image?,title?,body?,…} where an ABSENT key means OFF,
 * so a part added later renders on old cards only when toggled, with no further
 * migration. Existing cards map 1:1 (text->{body}, image-text->{image,body}, …).
 * v5 = card size is per-ROW: a stack sizes as a unit (slots.rowW keyed by row),
 * so any legacy per-card flow width (overrides["cards.<id>"]={w,flow}) folds into
 * its row and the per-card override is dropped. Cards then render at the row size.
 * v6 = deck-level `aspect` ('16:9' | '4:3') driving `deck.canvas` dims; legacy decks
 * get aspect inferred from their canvas (always 16:9) and a missing canvas backfilled.
 * v7 = SHARED slides (track-35 C): a slide may be stored as a LINK, `{id, ref}`,
 * where `ref` is the id of a slide living in the reserved __library__ container. The
 * ref is resolved to full content on load and re-collapsed on save by
 * adapters/sharedSlides.js: the core only ever sees a hydrated slide that still
 * carries its `.ref`. Nothing to migrate (no existing deck has a ref); the bump
 * records that a v7 deck's slides[] may not be self-contained.
 */
export const SCHEMA_VERSION = 7;

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
  const dropMode = from < 4; // one-shot: retire the card `mode` field (folded into parts)
  const foldRowW = from < 5; // one-shot: fold per-card card widths into per-row slots.rowW

  // v6: deck-level aspect ratio. Legacy decks carry a canvas but no aspect; infer it,
  // and backfill a missing canvas from the aspect. Always-ensure -> idempotent.
  if (deck.aspect == null) deck.aspect = aspectOfCanvas(deck.canvas);
  if (!deck.canvas) deck.canvas = canvasForAspect(deck.aspect);

  for (const slide of deck.slides || []) {
    const slots = slide.slots || {};
    const ov = (slide.overrides = slide.overrides || {});
    const ts = slide.textStyle || {};

    if (Array.isArray(slots.cards)) {
      slots.cards.forEach((c, i) => {
        if (!c) return;
        if (c.id == null) c.id = uid();
        if (c.parts == null) c.parts = modeToParts(c.mode); // always-ensure, mirrors the id ensure
        if (dropMode) delete c.mode;                        // one-shot: the field is retired
        if (repoint) {
          moveKey(ov, `cards.${i}`, `cards.${c.id}`);
          moveStyle(ts, `cards.${i}.text`, c);
        }
        if (addSteps && c.step == null) c.step = i + 1;
      });
      if (foldRowW) {
        const rowW = slots.rowW || {};
        slots.cards.forEach((c) => {
          if (!c) return;
          const o = ov[`cards.${c.id}`];
          // Only a PURE basis override (the flowCard.write shape {w, flow:true})
          // folds; a full {x,y,w,h} box that happens to carry flow is left alone.
          if (o && o.flow && o.w != null && o.x == null && o.y == null && o.h == null) {
            const r = c.row || 0;
            if (rowW[r] == null) rowW[r] = o.w; // first card's width sets its row
            delete ov[`cards.${c.id}`];          // the per-card override is retired
          }
        });
        if (Object.keys(rowW).length) slots.rowW = rowW;
      }
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

/**
 * Clear every MANUAL per-item text override in the deck (the "aplicar a tudo" reset),
 * so all text falls back to the theme/role defaults. Drops slide.textStyle, each list
 * item's `.style`, and each asset's `.style`. Pure: mutates + returns the deck (the
 * caller wraps it in one undo snapshot). Geometry overrides (slide.overrides) are NOT
 * touched, those are position, not style.
 */
export function clearTextOverrides(deck) {
  if (!deck) return deck;
  for (const slide of deck.slides || []) {
    delete slide.textStyle;
    const slots = slide.slots || {};
    for (const k in slots) {
      const v = slots[k];
      if (Array.isArray(v)) v.forEach((it) => { if (it && it.style) delete it.style; });
    }
  }
  for (const a of deck.assets || []) { if (a && a.style) delete a.style; }
  return deck;
}

/** Map a legacy card `mode` (title|text|image|image-text) onto the composable
 *  `parts` map. Unknown/absent modes fall back to a body-only card, so a malformed
 *  legacy card still renders something. */
function modeToParts(mode) {
  switch (mode) {
    case "title": return { title: true };
    case "image": return { image: true };
    case "image-text": return { image: true, body: true };
    default: return { body: true };
  }
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
