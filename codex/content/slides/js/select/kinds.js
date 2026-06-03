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
import { getByPath } from "../core/schema.js";
import { formatControls } from "../edit/textstyle.js";

// "voltar ao layout": clears the slot's freeform override so it returns to the
// layout's flow. Shared by the text + image slot descriptors; only offered while
// an absolute override actually exists.
function resetCtrl() {
  return {
    type: "button",
    id: "reset",
    labelKey: "slides.ed_to_layout",
    run(app, sel) {
      app.record();
      const ov = app.cur().overrides;
      if (ov) delete ov[sel.ref];
      app.refresh();
    },
  };
}

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
const isTextAsset = (a) => a && (a.type === "text" || a.type === "title");

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
  // the editable text inside a text asset (the format controls + activeEditable
  // target the .atext, not the wrapper). null for media assets.
  editEl(app, sel) {
    return app.stage.querySelector(`.asset[data-asset="${sel.ref}"] [data-aid]`);
  },
  target(app, sel) {
    return app.deck().assets.find((a) => a.id === sel.ref) || null;
  },
  controls(app, sel, a) {
    if (!a) return [];
    const ctrls = isTextAsset(a) ? [...formatControls(), { type: "sep" }] : [];
    ctrls.push({
      type: "choice",
      id: "scope",
      value: a.scope || "slide",
      options: [
        { v: "slide", labelKey: "slides.ed_asset_slide" },
        { v: "all", labelKey: "slides.ed_asset_all" },
        { v: "layout", labelKey: "slides.ed_asset_layout" },
      ],
      write(app2, sel2, v) {
        app2.record("ctx:scope");
        const obj = app2.deck().assets.find((x) => x.id === sel2.ref);
        if (!obj) return;
        obj.scope = v;
        if (v === "slide") obj.slideId = app2.cur().id;
        if (v === "layout") obj.layout = app2.cur().layout;
        app2.refresh();
      },
    });
    if (isImageAsset(a)) {
      ctrls.push({
        type: "button",
        id: "mask",
        labelKey: "slides.ed_mask",
        compound: true, // opens the mask sub-panel; reuses the existing popover
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
        type: "choice",
        id: "variant",
        value: eff.variant,
        options: [
          { v: "light", labelKey: "slides.ed_logo_light" },
          { v: "dark", labelKey: "slides.ed_logo_dark" },
          { v: "teal", labelKey: "slides.ed_logo_teal" },
          { v: "mark", labelKey: "slides.ed_logo_mark" },
        ],
        write(app2, sel2, v) {
          app2.record("ctx:variant");
          const s = app2.cur();
          if (s.logo) s.logo.variant = v;
          else (app2.deck().logo = app2.deck().logo || { ...DEFAULT_LOGO }).variant = v;
          app2.refresh();
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
          app2.record("ctx:perslide");
          const s = app2.cur();
          if (checked) {
            const e = resolveLogo(app2.deck(), s);
            s.logo = { x: e.x, y: e.y, h: e.h, variant: e.variant };
            delete s.logoVariant; // fold the legacy per-slide variant into slide.logo
          } else {
            delete s.logo;
          }
          app2.refresh();
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

/* ---------- textSlot (Slice 2): a layout's free text slot (ed() output) ---------- */
// An .editable carrying BOTH data-fkey and data-path is a free text slot. Card
// text uses edPlain (no data-fkey) and stays on freeform until Slice 3, so a match
// inside a .card is rejected. Text FORMATTING stays in the caret-anchored #fmt
// toolbar; the bar only carries "voltar ao layout" once the slot has been freed.
register({
  id: "textSlot",
  geometry: "freeformSlot",
  match(el) {
    const t = el.closest && el.closest('.editable[data-fkey][data-path][data-edit="1"]');
    if (!t || (t.closest && t.closest(".card"))) return null;
    return { kind: "textSlot", ref: t.dataset.fkey };
  },
  el(app, sel) {
    return app.stage.querySelector(`[data-fkey="${sel.ref}"]`);
  },
  // a free text slot IS its own editable element; the format controls target it.
  editEl(app, sel) {
    return app.stage.querySelector(`[data-fkey="${sel.ref}"]`);
  },
  target(app, sel) {
    return (app.cur().overrides || {})[sel.ref] || null;
  },
  controls(app, sel) {
    const ctrls = [...formatControls()];
    if ((app.cur().overrides || {})[sel.ref]) ctrls.push({ type: "sep" }, resetCtrl());
    return ctrls;
  },
});

/* ---------- imageSlot (Slice 2): a filled image slot (imgslot() output) ---------- */
// A filled .dropzone (split/bleed images, the cover icon) carrying data-fkey. Card
// images live inside a .card and stay on freeform until Slice 3. The box geometry
// is freeformSlot; pan/zoom is the separate imageFraming strategy. The mask popover
// is folded into the bar as a compound control (the same #maskpop the asset reuses),
// and "trocar" replaces the photo.
register({
  id: "imageSlot",
  geometry: "freeformSlot",
  match(el) {
    const im = el.closest && el.closest(".dropzone.filled[data-fkey]");
    if (!im || (im.closest && im.closest(".card"))) return null;
    return { kind: "imageSlot", ref: im.dataset.fkey };
  },
  el(app, sel) {
    return app.stage.querySelector(`.dropzone.filled[data-fkey="${sel.ref}"]`);
  },
  target(app, sel) {
    return getByPath(app.cur().slots, sel.ref) || null;
  },
  controls(app, sel, img) {
    const ctrls = [
      {
        type: "button",
        id: "replace",
        labelKey: "slides.ed_replace",
        run(app2, sel2) {
          app2.pickImage(sel2.ref);
        },
      },
      {
        type: "button",
        id: "mask",
        labelKey: "slides.ed_mask",
        compound: true, // reuses the existing #maskpop popover
        run(app2, sel2, anchorEl) {
          app2.openMask({ kind: "slot", path: sel2.ref }, anchorEl);
        },
      },
    ];
    if ((app.cur().overrides || {})[sel.ref]) ctrls.push(resetCtrl());
    return ctrls;
  },
});
