// select/geometry.js  (SLIDES-EDITOR-INTERNAL, see selection.js scope lock)
//
// Per-kind geometry STRATEGIES plus a capability map. Geometry is one verb-set
// (move / resize / rotate) dispatched to a strategy, so the selection frame
// never switches on a kind id: it asks geometryCaps which handles to show and
// calls the strategy's read / write / patch.
//
//   read(app, sel, el)   -> { x, y, w, h, rot } in canvas coords (measures the
//                           live element for dimensions the model does not store)
//   write(app, sel, g)   -> commit geometry back to the model object
//   patch(el, g, app)    -> live inline-style patch of the one element (per tick,
//                           so a drag never triggers a full stage re-render). `app`
//                           is passed so flow-rooted slots can use freedStyle's
//                           offset-parent walk; absolute kinds ignore it.
import { resolveLogo, DEFAULT_LOGO, freedStyle, flowStyle } from "../render/player.js";
import { getByPath } from "../core/schema.js";

/** Which transform handles a strategy supports (drives the selection frame). */
export function geometryCaps(name) {
  switch (name) {
    case "absoluteAsset":
      return { move: true, resizeW: true, resizeH: false, rotate: true };
    case "deckLogo":
      return { move: true, resizeW: false, resizeH: true, rotate: false };
    case "freeformSlot":
      return { move: true, resizeW: true, resizeH: true, rotate: true };
    case "flowCard":
      // width only: a card's height is content-driven, so a height handle could
      // only ever grow (never shrink past content) — a false affordance. Resize
      // the basis (width) in the row; neighbours conform.
      return { move: false, resizeW: true, resizeH: false, rotate: false };
    case "ratio":
      // the divider is dragged horizontally (a move along x); that x IS the split.
      return { move: true, resizeW: false, resizeH: false, rotate: false };
    default:
      return { move: false, resizeW: false, resizeH: false, rotate: false };
  }
}

// Measure a live element in canvas coordinates. Used to seed the dimensions the
// model does not persist (an asset's height, the logo's width: both auto).
function measure(el, app) {
  const sc = app.scaleNow();
  const sr = app.stage.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { x: (r.left - sr.left) / sc, y: (r.top - sr.top) / sc, w: r.width / sc, h: r.height / sc };
}

export const strategies = {
  // Free asset: direct x / y / w / rot on the asset object; height stays auto.
  absoluteAsset: {
    obj(app, sel) {
      return app.deck().assets.find((a) => a.id === sel.ref) || null;
    },
    read(app, sel, el) {
      const a = this.obj(app, sel);
      const m = el ? measure(el, app) : { w: 0, h: 0 };
      return { x: a ? a.x : 0, y: a ? a.y : 0, w: a ? a.w : m.w, h: m.h, rot: a ? a.rot || 0 : 0 };
    },
    write(app, sel, g) {
      const a = this.obj(app, sel);
      if (!a) return;
      a.x = g.x;
      a.y = g.y;
      a.w = g.w;
      a.rot = g.rot || 0;
    },
    patch(el, g) {
      el.style.left = g.x + "px";
      el.style.top = g.y + "px";
      el.style.width = g.w + "px";
      el.style.transform = `rotate(${g.rot || 0}deg)`;
    },
  },

  // Logo: move + height-only resize. Writes slide.logo when the per-slide
  // override is active (A1), else the deck-level deck.logo (the fallback). The
  // variant is a bar control, not geometry.
  deckLogo: {
    target(app) {
      const s = app.cur();
      if (s.logo) return s.logo;
      if (!app.deck().logo) app.deck().logo = { ...DEFAULT_LOGO };
      return app.deck().logo;
    },
    read(app, sel, el) {
      const lg = resolveLogo(app.deck(), app.cur());
      const m = el ? measure(el, app) : { w: 0 };
      return { x: lg.x, y: lg.y, w: m.w, h: lg.h, rot: 0 };
    },
    write(app, sel, g) {
      const tgt = this.target(app);
      tgt.x = g.x;
      tgt.y = g.y;
      tgt.h = g.h;
    },
    patch(el, g) {
      el.style.left = g.x + "px";
      el.style.top = g.y + "px";
      el.style.height = g.h + "px";
    },
  },

  // Slot box (text + image slots, Slice 2): move / resize / rotate written to the
  // slide's `overrides` map keyed by fkey (= the slot path) — the SAME storage the
  // old freeform layer used, so existing decks keep their freed slots. A slot only
  // leaves the layout's flow once it is actually dragged: until an absolute override
  // exists, read() measures the live in-flow element. The mask/replace controls are
  // bar primitives (see kinds.js); the box geometry is here.
  freeformSlot: {
    read(app, sel, el) {
      const o = sel && (app.cur().overrides || {})[sel.ref];
      if (o && !o.flow) return { x: o.x, y: o.y, w: o.w, h: o.h, rot: o.rot || 0 };
      if (el) {
        const m = measure(el, app);
        return { x: m.x, y: m.y, w: m.w, h: m.h, rot: 0 };
      }
      return { x: 0, y: 0, w: 0, h: 0, rot: 0 };
    },
    write(app, sel, g) {
      if (!sel) return;
      const ov = (app.cur().overrides = app.cur().overrides || {});
      ov[sel.ref] = { x: g.x, y: g.y, w: g.w, h: g.h, rot: g.rot || 0 };
    },
    patch(el, g, app) {
      freedStyle(el, g, app.stage); // offset-parent-correct, since slots live in flow
    },
  },

  // Flow card (Slice 3): a card resizes WITHIN the flex stack — neighbours reflow
  // and conform, the card never lifts out to absolute (caps: no move, no rotate).
  // The override stores only the basis (w) + min-height (h) with flow:true, the
  // SAME shape the old freeform flow branch produced, so existing freed cards keep
  // resizing. read() measures the live element (its size is applied by flowStyle on
  // render, so the rect is authoritative); the box just tracks it. Keyed by the
  // card's stable id ref, so a resize survives reorder.
  flowCard: {
    read(app, sel, el) {
      if (!el) return { x: 0, y: 0, w: 0, h: 0, rot: 0 };
      const m = measure(el, app);
      return { x: m.x, y: m.y, w: m.w, h: m.h, rot: 0 };
    },
    write(app, sel, g) {
      if (!sel) return;
      const ov = (app.cur().overrides = app.cur().overrides || {});
      ov[sel.ref] = { w: g.w, flow: true }; // width only; height stays content-driven
    },
    patch(el, g) {
      flowStyle(el, g); // basis only (no h -> no min-height); siblings conform
    },
  },

  // Ratio (split divider): a horizontal drag, not a box. The divider's position IS
  // the column split (slots.ratio): read maps the ratio to a full-height line at
  // canvas-x, write maps the dragged x back to a clamped ratio, and patch repaints
  // the live .L-split grid + the divider. Dispatched as a move gesture (caps: move
  // only) through the shared frame, replacing the bespoke editor.js divider handler.
  ratio: {
    clampX(app, x) {
      return Math.min(0.8, Math.max(0.2, x / app.deck().canvas.w));
    },
    read(app, sel, el) {
      const c = app.deck().canvas;
      const r = app.cur().slots.ratio != null ? app.cur().slots.ratio : 0.5;
      return { x: r * c.w, y: 0, w: 0, h: c.h, rot: 0 };
    },
    write(app, sel, g) {
      app.cur().slots.ratio = this.clampX(app, g.x);
    },
    patch(el, g, app) {
      const r = this.clampX(app, g.x);
      const grid = app.stage.querySelector(".L-split");
      if (grid) grid.style.gridTemplateColumns = `${r * 100}% ${(1 - r) * 100}%`;
      el.style.left = r * 100 + "%";
    },
  },
};

// Image framing: pan (tx/ty) + zoom inside the slot's fixed box. Deliberately
// SEPARATE from the box geometry above — reframing the photo never moves the box,
// and the box transform never touches the photo. Keyed by the slot path (`ref`),
// not by a selection record, so the wheel-zoom handler can drive it directly.
strategies.imageFraming = {
  obj(app, ref) {
    return getByPath(app.cur().slots, ref) || null;
  },
  read(app, ref) {
    const o = this.obj(app, ref) || {};
    return { tx: o.tx || 0, ty: o.ty || 0, zoom: o.zoom || 1 };
  },
  write(app, ref, f) {
    const o = this.obj(app, ref);
    if (!o) return;
    o.tx = f.tx;
    o.ty = f.ty;
    o.zoom = f.zoom;
  },
  patch(el, f) {
    el.style.transform = `translate(${f.tx || 0}px,${f.ty || 0}px) scale(${f.zoom || 1})`;
  },
};
