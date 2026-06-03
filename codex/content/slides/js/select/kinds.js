// select/kinds.js  (SLIDES-EDITOR-INTERNAL, see selection.js scope lock)
//
// Descriptor REGISTRY: one entry per selectable kind, mirroring the layout-plugin
// philosophy. Each descriptor is data plus small pure functions:
//   match(el)             -> { kind, ref } | null   (logical locator, never a node)
//   el(app, sel)          -> live DOM node | null    (re-resolve ref after render)
//   target(app, sel)      -> the model object the controls read/mutate
//   controls(app, sel, t) -> array of CONTROL PRIMITIVES (pure data + closures)
//   geometry              -> strategy name (see geometry.js)
// The bar and frame read ONLY this contract; they never switch on a kind id.
// A new kind = a new register() block; a new control = one array entry.
import { resolveLogo, DEFAULT_LOGO } from "../render/player.js";

const _kinds = new Map();
export function register(d) {
  _kinds.set(d.id, d);
}
export function get(id) {
  return _kinds.get(id);
}
export function list() {
  return [..._kinds.values()];
}

// Try descriptors in registration (specificity) order; the first hit wins.
export function matchKind(el) {
  for (const d of _kinds.values()) {
    const hit = d.match(el);
    if (hit) return hit;
  }
  return null;
}

const isImageAsset = (a) => a && (a.type === "image" || a.type === "photo" || a.type == null);

/* ---------- asset (free-placed image / photo / video / text) ---------- */
register({
  id: "asset",
  geometry: "absoluteAsset",
  match(el) {
    const a = el.closest && el.closest(".asset");
    return a ? { kind: "asset", ref: a.dataset.asset } : null;
  },
  el(app, sel) {
    return app.stage.querySelector(`.asset[data-asset="${sel.ref}"]`);
  },
  target(app, sel) {
    return app.deck().assets.find((a) => a.id === sel.ref) || null;
  },
  controls(app, sel, a) {
    if (!a) return [];
    const ctrls = [
      {
        type: "select",
        id: "scope",
        value: a.scope || "slide",
        options: [
          { v: "slide", labelKey: "slides.ed_asset_slide" },
          { v: "all", labelKey: "slides.ed_asset_all" },
          { v: "layout", labelKey: "slides.ed_asset_layout" },
        ],
        write(app2, sel2, v) {
          const obj = app2.deck().assets.find((x) => x.id === sel2.ref);
          if (!obj) return;
          obj.scope = v;
          if (v === "slide") obj.slideId = app2.cur().id;
          if (v === "layout") obj.layout = app2.cur().layout;
        },
      },
    ];
    if (isImageAsset(a)) {
      ctrls.push({
        type: "button",
        id: "mask",
        labelKey: "slides.ed_mask",
        compound: true, // opens the mask sub-panel; reuses the existing popover in Slice 1
        run(app2, sel2, anchorEl) {
          app2.openMask({ kind: "asset", id: sel2.ref }, anchorEl);
        },
      });
    }
    ctrls.push({
      type: "button",
      id: "delete",
      label: "✕",
      danger: true,
      run(app2, sel2) {
        app2.record();
        app2.deck().assets = app2.deck().assets.filter((x) => x.id !== sel2.ref);
        app2.selectClear();
        app2.refresh();
      },
    });
    return ctrls;
  },
});

/* ---------- logo (deck-level, per-slide overridable = A1/A2) ---------- */
register({
  id: "logo",
  geometry: "deckLogo",
  match(el) {
    const l = el.closest && el.closest(".logo[data-logo]");
    return l ? { kind: "logo", ref: "logo" } : null;
  },
  el(app) {
    return app.stage.querySelector(".logo[data-logo]");
  },
  target(app) {
    // the object whose variant the bar edits: per-slide override, else deck logo
    const s = app.cur();
    return s.logo || app.deck().logo || null;
  },
  controls(app) {
    const slide = app.cur();
    const perSlide = !!slide.logo;
    const eff = resolveLogo(app.deck(), slide);
    return [
      {
        type: "select",
        id: "variant",
        value: eff.variant,
        options: [
          { v: "light", labelKey: "slides.ed_logo_light" },
          { v: "dark", labelKey: "slides.ed_logo_dark" },
          { v: "teal", labelKey: "slides.ed_logo_teal" },
          { v: "mark", labelKey: "slides.ed_logo_mark" },
        ],
        write(app2, sel2, v) {
          const s = app2.cur();
          if (s.logo) s.logo.variant = v;
          else (app2.deck().logo = app2.deck().logo || { ...DEFAULT_LOGO }).variant = v;
        },
      },
      {
        // A2 (logo-only): "só neste slide" promotes the deck logo to a per-slide
        // override (geometry + variant), or drops back to following the deck.
        type: "toggle",
        id: "perslide",
        labelKey: "slides.ed_logo_thisslide",
        on: perSlide,
        write(app2, sel2, checked) {
          const s = app2.cur();
          if (checked) {
            const e = resolveLogo(app2.deck(), s);
            s.logo = { x: e.x, y: e.y, h: e.h, variant: e.variant };
            delete s.logoVariant; // fold the legacy per-slide variant into slide.logo
          } else {
            delete s.logo;
          }
        },
      },
      {
        type: "button",
        id: "hide",
        labelKey: "slides.ed_logo_hide",
        run(app2) {
          app2.record();
          app2.cur().hideLogo = true;
          app2.selectClear();
          app2.refresh();
        },
      },
    ];
  },
});
