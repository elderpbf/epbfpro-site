// select/geometry.js  (SLIDES-EDITOR-INTERNAL, see selection.js scope lock)
//
// Per-kind geometry STRATEGIES plus a capability map. Geometry is one verb-set
// (move / resize / rotate) dispatched to a strategy, so the selection frame
// never switches on a kind id: it asks geometryCaps which handles to show and
// calls the strategy's read / write / patch.
//
//   read(app, sel, el)  -> { x, y, w, h, rot } in canvas coords (measures the
//                          live element for dimensions the model does not store)
//   write(app, sel, g)  -> commit geometry back to the model object
//   patch(el, g)        -> live inline-style patch of the one element (per tick,
//                          so a drag never triggers a full stage re-render)
import { resolveLogo, DEFAULT_LOGO } from "../render/player.js";

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
      return { move: false, resizeW: true, resizeH: true, rotate: false };
    case "ratio":
      return { move: false, resizeW: true, resizeH: false, rotate: false };
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
};
