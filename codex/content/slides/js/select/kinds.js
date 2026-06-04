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
import { getByPath, uid, resolveStyleObj } from "../core/schema.js";
import { formatControls } from "../edit/textstyle.js";
import { t } from "../../../../js/i18n.js";

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

/* ---------- imageSlot (Slice 2 + image box): an image slot (imgslot() output) ---------- */
// Any top-level .dropzone (split/bleed images, the cover icon) carrying data-fkey,
// EMPTY or FILLED. An empty slot is a selectable "image box": single-click selects
// it (handles + bar), and the bar offers a single "add image" button instead of the
// old click-to-open-OS-picker. A filled slot offers trocar/máscara (+ back-to-layout
// once freed). Card images live inside a .card and stay on freeform until Slice 3.
// The box geometry is freeformSlot; pan/zoom is the separate imageFraming strategy.
register({
  id: "imageSlot",
  geometry: "freeformSlot",
  match(el) {
    const im = el.closest && el.closest(".dropzone[data-fkey]");
    if (!im || (im.closest && im.closest(".card"))) return null;
    return { kind: "imageSlot", ref: im.dataset.fkey };
  },
  el(app, sel) {
    return app.stage.querySelector(`.dropzone[data-fkey="${sel.ref}"]`);
  },
  target(app, sel) {
    return getByPath(app.cur().slots, sel.ref) || null;
  },
  controls(app, sel, img) {
    // Empty box: a single "adicionar imagem" that picks straight into the slot path.
    if (!img || !img.src) {
      return [
        {
          type: "button",
          id: "addimage",
          labelKey: "slides.ed_add_image",
          run(app2, sel2) {
            app2.pickImage(sel2.ref);
          },
        },
      ];
    }
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

/* ---------- shared list-control factories (cards + topics, Slice 3) ----------
 * A ref is "<list>.<id>". The geometry-override key IS the ref, so a freed item's
 * geometry follows it by identity and survives reorder with NO remap. Per-item
 * text style lives on the object (.style), so it travels for free too. These are
 * the reusable delete/move/add idioms the old editor.js hand-rolled per kind. */
const newItem = (list) =>
  list === "cards"
    ? { id: uid(), mode: "text", text: t("slides.ed_new_card") }
    : { id: uid(), text: t("slides.ed_new_topic") };

const refIndex = (arr, ref) => arr.findIndex((x) => x && `${ref.split(".")[0]}.${x.id}` === ref);

function moveItem(app, ref, dir) {
  const arr = app.cur().slots[ref.split(".")[0]];
  const i = refIndex(arr, ref);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= arr.length) return;
  app.record();
  [arr[i], arr[j]] = [arr[j], arr[i]]; // override is id-keyed, so it follows the item
  app.refresh();
}

// Drag-and-drop reorder: move the dragged item to the drop target's slot in the
// SAME list. Like moveItem but to an arbitrary index; the id-keyed override + style
// follow the item by identity (no remap). Used by select/reorder.js. Exported so the
// drag layer drives the model through one shared mutation, never its own splice.
export function reorderItem(app, fromRef, toRef) {
  const list = fromRef.split(".")[0];
  const arr = app.cur().slots[list];
  if (!arr) return;
  const from = refIndex(arr, fromRef);
  const to = refIndex(arr, toRef);
  if (from < 0 || to < 0 || from === to) return;
  app.record();
  const [item] = arr.splice(from, 1);
  arr.splice(to, 0, item);
  app.refresh();
}

function removeItem(app, ref, keepOne) {
  const list = ref.split(".")[0];
  const arr = app.cur().slots[list];
  const i = refIndex(arr, ref);
  if (i < 0) return;
  app.record();
  arr.splice(i, 1);
  const ov = app.cur().overrides;
  if (ov) delete ov[ref];
  if (keepOne && !arr.length) arr.push(newItem(list));
  app.step = Math.min(app.step, app.maxStep());
  app.selectClear();
  app.refresh();
}

function addItem(app, list) {
  app.record();
  (app.cur().slots[list] = app.cur().slots[list] || []).push(newItem(list));
  if (list === "topics") app.step = app.maxStep(); // reveal the new bullet
  app.refresh();
}

// add a sibling immediately AFTER the selected item (ref = "<list>.<id>"), so
// "＋" on a card/topic inserts to its right rather than at the end of the list.
function addAfter(app, ref) {
  const list = ref.split(".")[0];
  const arr = (app.cur().slots[list] = app.cur().slots[list] || []);
  const i = refIndex(arr, ref);
  app.record();
  arr.splice(i + 1, 0, newItem(list));
  if (list === "topics") app.step = app.maxStep();
  app.refresh();
}

/* ---------- card (Slice 3): flexible card; resizes in-stack (flowCard) ---------- */
register({
  id: "card",
  geometry: "flowCard",
  match(el) {
    const c = el.closest && el.closest(".card");
    return c ? { kind: "card", ref: c.dataset.fkey } : null;
  },
  el(app, sel) {
    return app.stage.querySelector(`.card[data-fkey="${sel.ref}"]`);
  },
  // the card's text editable (the format controls target it); null for image-only.
  editEl(app, sel) {
    const c = this.el(app, sel);
    return c ? c.querySelector('.editable[data-edit="1"]') : null;
  },
  target(app, sel) {
    return resolveStyleObj(app.cur().slots, sel.ref);
  },
  controls(app, sel, card) {
    if (!card) return [];
    const ctrls = [];
    if (this.editEl(app, sel)) ctrls.push(...formatControls(), { type: "sep" });
    ctrls.push({
      type: "choice",
      id: "mode",
      value: card.mode,
      options: [
        { v: "title", label: "Título" },
        { v: "text", label: "Texto" },
        { v: "image", label: "Imagem" },
        { v: "image-text", label: "Imagem+texto" },
      ],
      write(app2, sel2, v) {
        app2.record();
        const c = resolveStyleObj(app2.cur().slots, sel2.ref);
        if (c) c.mode = v;
        app2.refresh();
      },
    });
    ctrls.push(
      { type: "button", id: "move-l", label: "◀", run(app2, sel2) { moveItem(app2, sel2.ref, -1); } },
      { type: "button", id: "move-r", label: "▶", run(app2, sel2) { moveItem(app2, sel2.ref, 1); } },
      { type: "button", id: "add", label: "＋ card", run(app2, sel2) { addAfter(app2, sel2.ref); } },
      { type: "button", id: "delete", label: "✕", danger: true, run(app2, sel2) { removeItem(app2, sel2.ref, true); } }
    );
    return ctrls;
  },
});

/* ---------- topic (Slice 3): a bullet in a list; freed like a text slot ---------- */
register({
  id: "topic",
  geometry: "freeformSlot",
  match(el) {
    const li = el.closest && el.closest("li[data-fkey]");
    return li ? { kind: "topic", ref: li.dataset.fkey } : null;
  },
  el(app, sel) {
    return app.stage.querySelector(`li[data-fkey="${sel.ref}"]`);
  },
  editEl(app, sel) {
    const li = this.el(app, sel);
    return li ? li.querySelector('.editable[data-edit="1"]') : null;
  },
  target(app, sel) {
    return resolveStyleObj(app.cur().slots, sel.ref);
  },
  controls(app, sel) {
    const ctrls = [
      ...formatControls(),
      { type: "button", id: "move-up", label: "▲", run(app2, sel2) { moveItem(app2, sel2.ref, -1); } },
      { type: "button", id: "move-down", label: "▼", run(app2, sel2) { moveItem(app2, sel2.ref, 1); } },
      { type: "button", id: "add", label: "＋ tópico", run(app2, sel2) { addAfter(app2, sel2.ref); } },
      { type: "button", id: "delete", label: "remover", danger: true, run(app2, sel2) { removeItem(app2, sel2.ref, false); } },
    ];
    if ((app.cur().overrides || {})[sel.ref]) ctrls.push({ type: "sep" }, resetCtrl());
    return ctrls;
  },
});

/* ---------- container (Slice 3): the cards stack / topics list; carries add ----------
 * Clicking the stack/list background selects the STRUCTURE; its bar offers "add".
 * No geometry (no handles): it is a controls host, not a transform target. Registered
 * AFTER card + topic so a click on a card/li resolves to that item, not the container. */
register({
  id: "container",
  geometry: "none",
  match(el) {
    if (el.closest && el.closest(".cardrow")) return { kind: "container", ref: "cards" };
    if (el.closest && el.closest(".topiclist")) return { kind: "container", ref: "topics" };
    return null;
  },
  el(app, sel) {
    return app.stage.querySelector(sel.ref === "cards" ? ".cardrow" : ".topiclist");
  },
  target(app, sel) {
    return app.cur().slots[sel.ref] || null;
  },
  controls(app, sel) {
    return [
      {
        type: "button",
        id: "add",
        label: sel.ref === "cards" ? "＋ card" : "＋ tópico",
        run(app2, sel2) { addItem(app2, sel2.ref); },
      },
    ];
  },
});

/* ---------- divider (Slice 3): the split's column-ratio handle (drag-only) ----------
 * No controls: the divider element IS the handle, dragged horizontally to set
 * slots.ratio via the `ratio` geometry. Replaces the bespoke editor.js drag. */
register({
  id: "divider",
  geometry: "ratio",
  match(el) {
    const d = el.closest && el.closest(".divider");
    return d ? { kind: "divider", ref: "ratio" } : null;
  },
  el(app) {
    return app.stage.querySelector(".divider");
  },
  target(app) {
    return app.cur().slots;
  },
  controls() {
    return [];
  },
});
