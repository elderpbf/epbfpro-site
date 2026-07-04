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
import { list as cardParts } from "../render/cardparts.js";
import { singletonKey, listModeOf, isAnimated } from "../render/animsteps.js";
import * as registry from "../layouts/registry.js";
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

// Phase 7: animation controls. A SINGLETON (free asset, filled image slot, free text box)
// gets an "Animar" include/exclude toggle; when animated it also gets ◀ ▶ to reorder its
// place in the reveal sequence. A DECK (a whole topics/cards list) is controlled as a UNIT
// (Élder: "a animação de decks é pro deck inteiro, não por card"): item a item / tudo
// junto / não animar, plus ◀ ▶ to move the whole deck. All of this reads/writes the ordered
// slide.build through app.anim* (materialized on first edit), so the bar and the step engine
// (player.autoSteps -> animsteps.planSteps) stay one source of truth. `def` is the block's
// AUTO default (blocks true, free text boxes false, so titles stay fixed until opted in).
// Consistent with the panel (edit/animpanel.js): a singleton is ONE "Animar" toggle
// (active = animated). Reorder lives in the panel, not the bar.
function animCtrls(app, kind, ref, def) {
  const key = singletonKey(kind, ref);
  return [{
    type: "toggle", id: "animate", labelKey: "slides.ed_animate",
    on: isAnimated(app.cur().build, key, def),
    write(app2, sel2, checked) { app2.animToggle(key, checked); },
  }];
}

// A whole deck's animation, offered on the item/container bar. Same two toggles as the
// panel: "item a item" / "tudo junto" — the active one is the mode; clicking the active one
// (or leaving both off) turns the deck off. Reorder lives in the panel.
function deckAnimCtrls(app, list) {
  const mode = listModeOf(app.cur().build, list); // "each" | "unit" | "none"
  return [
    { type: "toggle", id: "anim-each", labelKey: "slides.ed_anim_each", on: mode === "each",
      write(app2, sel2, checked) { app2.animListMode(list, checked ? "each" : "none"); } },
    { type: "toggle", id: "anim-unit", labelKey: "slides.ed_anim_unit", on: mode === "unit",
      write(app2, sel2, checked) { app2.animListMode(list, checked ? "unit" : "none"); } },
  ];
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
    const ctrls = isTextAsset(a) ? [...formatControls(app), { type: "sep" }] : [];
    // A stack's items live in THIS slide's slots, so it stays slide-scoped (no
    // all/layout choice, which would render it on slides that lack its list).
    if (a.type !== "stack") ctrls.push({
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
    // A stack is selected as a UNIT (the asset wins the click), so its OWN bar carries
    // the grow control: "＋ card" / "＋ tópico" adds to its slots list. This is how a
    // free-placed Lista or Card stack grows ("click the stack, add more").
    if (a.type === "stack") ctrls.push({
      type: "button",
      id: "add",
      label: `＋ ${a.variant === "cards" ? t("slides.ed_card") : t("slides.ed_topic")}`,
      run(app2, sel2) {
        const obj = app2.deck().assets.find((x) => x.id === sel2.ref);
        if (obj && obj.listKey) addItem(app2, obj.listKey);
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
    ctrls.push({ type: "sep" }, ...animCtrls(app, "asset", sel.ref, true));
    ctrls.push({
      type: "button",
      id: "delete",
      label: "✕",
      danger: true,
      run(app2, sel2) {
        app2.record();
        const gone = app2.deck().assets.find((x) => x.id === sel2.ref);
        app2.deck().assets = app2.deck().assets.filter((x) => x.id !== sel2.ref);
        // A stack owns its slots list; drop it too so no orphan list lingers.
        if (gone && gone.type === "stack" && gone.listKey) delete app2.cur().slots[gone.listKey];
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
    const ctrls = [...formatControls(app)];
    ctrls.push({ type: "sep" }, ...animCtrls(app, "textSlot", sel.ref, false));
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
          run(app2, sel2, btnEl) {
            app2.openGallery({ kind: "slot", path: sel2.ref }, btnEl);
          },
        },
      ];
    }
    const ctrls = [
      {
        type: "button",
        id: "replace",
        labelKey: "slides.ed_replace",
        run(app2, sel2, btnEl) {
          app2.openGallery({ kind: "slot", path: sel2.ref }, btnEl);
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
    ctrls.push({ type: "sep" }, ...animCtrls(app, "imageSlot", sel.ref, true));
    if ((app.cur().overrides || {})[sel.ref]) ctrls.push(resetCtrl());
    return ctrls;
  },
});

/* ---------- shared list-control factories (cards + topics, Slice 3) ----------
 * A ref is "<list>.<id>". The geometry-override key IS the ref, so a freed item's
 * geometry follows it by identity and survives reorder with NO remap. Per-item
 * text style lives on the object (.style), so it travels for free too. These are
 * the reusable delete/move/add idioms the old editor.js hand-rolled per kind. */
// The free-placed stack asset (if any) that owns a given slots list key. Its
// `variant` decides what a fresh item is (a card vs a bullet), so a free stack grows
// with the right shape with no per-call flag threading.
function stackAssetOf(app, listKey) {
  const assets = app && app.deck && app.deck().assets;
  return (Array.isArray(assets) && assets.find((a) => a && a.type === "stack" && a.listKey === listKey)) || null;
}

const cardSeed = () => ({ id: uid(), parts: { body: true }, text: t("slides.ed_new_card") });
const topicSeed = () => ({ id: uid(), text: t("slides.ed_new_topic") });

// A fresh list item. Cards + topics keep their friendly placeholder; a free-placed
// stack derives its shape from the asset variant (cards -> a card, else a bullet);
// any OTHER named list derives its shape from the layout's own seed (the first
// default item, minus id/step, with text fields blanked and structural objects
// cloned), so a multi-field list (define's {term,text}, agenda's {time,text}) adds a
// fully-shaped item.
function newItem(list, app) {
  if (list === "cards") return cardSeed();
  if (list === "topics") return topicSeed();
  const st = stackAssetOf(app, list);
  if (st) return st.variant === "cards" ? cardSeed() : topicSeed();
  const layout = app && registry.get(app.cur().layout);
  const seed = layout && layout.defaults && layout.defaults()[list];
  const tpl = Array.isArray(seed) && seed[0] && typeof seed[0] === "object" ? seed[0] : null;
  if (tpl) {
    const item = {};
    for (const k of Object.keys(tpl)) {
      if (k === "id" || k === "step") continue;
      const v = tpl[k];
      item[k] = v && typeof v === "object" ? JSON.parse(JSON.stringify(v)) : typeof v === "string" ? "" : v;
    }
    item.id = uid();
    return item;
  }
  return { id: uid(), text: "" };
}

const refIndex = (arr, ref) => arr.findIndex((x) => x && `${ref.split(".")[0]}.${x.id}` === ref);

function moveItem(app, ref, dir) {
  const arr = app.cur().slots[ref.split(".")[0]];
  const i = refIndex(arr, ref);
  if (i < 0) return;
  // Move within the item's OWN row: skip past any cards in other rows to the nearest
  // same-row neighbour in `dir` (topics are all row 0, so this is plain adjacency).
  const row = arr[i].row || 0;
  let j = i + dir;
  while (j >= 0 && j < arr.length && (arr[j].row || 0) !== row) j += dir;
  if (j < 0 || j >= arr.length) return;
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
  const toRow = arr[to].row || 0; // capture before the splice shifts indices
  const [item] = arr.splice(from, 1);
  if ((item.row || 0) !== toRow) item.row = toRow; // dragging across stacks adopts the target row
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
  if (keepOne && !arr.length) arr.push(newItem(list, app));
  app.step = Math.min(app.step, app.maxStep());
  app.selectClear();
  app.refresh();
}

function addItem(app, list, row = 0) {
  app.record();
  const arr = (app.cur().slots[list] = app.cur().slots[list] || []);
  const item = newItem(list, app);
  if (list === "cards" && row) item.row = row; // row 0 stays absent (clean default)
  // Insert after the last card already in this row so rows stay contiguous in the
  // flat array; topics (no rows) append as before.
  let at = arr.length;
  if (list === "cards") {
    for (let k = arr.length - 1; k >= 0; k--) {
      if ((arr[k].row || 0) === row) { at = k + 1; break; }
    }
  }
  arr.splice(at, 0, item);
  if (list === "topics") app.step = app.maxStep(); // reveal the new bullet
  app.refresh();
}

// Start a NEW stack (row) below the last, seeded with one card. The new card's row
// is maxRow+1; row-0 cards stay row-less, so a single-stack deck is never reshaped.
function addRow(app) {
  app.record();
  const arr = (app.cur().slots.cards = app.cur().slots.cards || []);
  const maxRow = arr.reduce((m, c) => Math.max(m, c.row || 0), 0);
  const item = newItem("cards", app);
  item.row = maxRow + 1;
  arr.push(item);
  app.refresh();
}

// add a sibling immediately AFTER the selected item (ref = "<list>.<id>"), so
// "＋" on a card/topic inserts to its right rather than at the end of the list.
function addAfter(app, ref) {
  const list = ref.split(".")[0];
  const arr = (app.cur().slots[list] = app.cur().slots[list] || []);
  const i = refIndex(arr, ref);
  app.record();
  const item = newItem(list, app);
  if (list === "cards" && arr[i] && (arr[i].row || 0)) item.row = arr[i].row; // same stack as the sibling
  arr.splice(i + 1, 0, item);
  if (list === "topics") app.step = app.maxStep();
  app.refresh();
}

// Card "Ajustes ▾" submenu (Slice 4): opens INTO the bar from the card descriptor,
// the same menu-into-bar pattern as Appearance/Animation. Two row-wide modes + one
// action, seeded from the slide's slots each open. It lives on the CARD bar (not the
// container's) because selecting the bare stack means clicking the awkward gaps
// between cards; both act on the whole row (Elder's call, 2026-06-03). `stacked` is a
// per-slide flag read by geometry.flowCard + the cards layout. Card size is per-row
// now (slots.rowW), so resize sizes the whole stack and `reset` clears those row
// sizes (back to equal flex); the old per-card symmetric-resize toggle is retired.
export function cardTogglesMenu(slots, card) {
  const stacked = !!slots.stacked; // labels follow the active axis (width in a row, height when stacked)
  // Composable parts live HERE now (off the dense card bar): one on/off toggle per
  // registered card part (imagem / título / texto / …), read from the SAME cardParts
  // registry the renderer uses, so a part registered later appears automatically with
  // NO edit here. `card` is the selected card (may be undefined when previewing).
  const ctrls = [];
  for (const p of cardParts()) {
    ctrls.push({
      type: "toggle", id: `part-${p.id}`, labelKey: p.labelKey,
      on: !!(card && card.parts && card.parts[p.id]),
      write(app, sel, checked) {
        app.record();
        const c = resolveStyleObj(app.cur().slots, sel.ref);
        if (c) c.parts = { ...(c.parts || {}), [p.id]: checked };
        app.refresh();
      },
    });
  }
  ctrls.push(
    { type: "sep" },
    {
      type: "toggle", id: "stack", labelKey: "slides.ed_stack_v", on: !!slots.stacked,
      write(app, sel, checked) { app.record(); app.cur().slots.stacked = checked; app.refresh(); },
    },
    {
      type: "button", id: "reset-widths", label: stacked ? t("slides.ed_equalize_h") : t("slides.ed_equalize_w"),
      run(app) { app.record(); delete app.cur().slots.rowW; app.refresh(); },
    },
  );
  return ctrls;
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
    const stacked = !!(app.cur().slots && app.cur().slots.stacked); // ▲▼ + vertical resize when stacked
    const ctrls = [];
    if (this.editEl(app, sel)) ctrls.push(...formatControls(app), { type: "sep" });
    // The card bar was DENSE: the per-part on/off toggles moved into "Ajustes ▾" (see
    // cardTogglesMenu) so the main bar is just move / add / delete + the opener.
    ctrls.push(
      { type: "button", id: "move-l", label: stacked ? "▲" : "◀", run(app2, sel2) { moveItem(app2, sel2.ref, -1); } },
      { type: "button", id: "move-r", label: stacked ? "▼" : "▶", run(app2, sel2) { moveItem(app2, sel2.ref, 1); } },
      { type: "button", id: "add", label: `＋ ${t("slides.ed_card")}`, run(app2, sel2) { addAfter(app2, sel2.ref); } },
      { type: "button", id: "delete", label: "✕", danger: true, run(app2, sel2) { removeItem(app2, sel2.ref, true); } },
      // Deck-wide animation, reachable from a card (skip free stacks: they animate via .asset).
      ...(stackAssetOf(app, sel.ref.split(".")[0]) ? [] : [{ type: "sep" }, ...deckAnimCtrls(app, sel.ref.split(".")[0])]),
      { type: "sep" },
      { type: "button", id: "toggles", label: `${t("slides.ed_adjust")} ▾`, run(app2, sel2, btnEl) { app2.select.openDropdown(cardTogglesMenu(app2.cur().slots, resolveStyleObj(app2.cur().slots, sel2.ref)), btnEl); } }
    );
    return ctrls;
  },
});

/* ---------- roadnode (4b): a roadmap node; a topic-like item + an "active" toggle ----------
 * Matches a node ONLY inside a .roadnodes list, so it wins over the generic topic kind
 * there (registered first) without touching real topics. Toggling "ativo" sets the
 * layout's slots.active to this node's index; the roadmap renderer highlights it. */
register({
  id: "roadnode",
  geometry: "freeformSlot",
  match(el) {
    if (!(el.closest && el.closest(".roadnodes"))) return null;
    const li = el.closest && el.closest("li[data-fkey]");
    return li ? { kind: "roadnode", ref: li.dataset.fkey } : null;
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
    const slots = app.cur().slots;
    const idx = (slots.nodes || []).findIndex((n) => `nodes.${n.id}` === sel.ref);
    return [
      ...formatControls(app),
      {
        type: "toggle", id: "active", label: "ativo", on: (slots.active || 0) === idx,
        write(app2, sel2, checked) { app2.record(); if (checked) app2.cur().slots.active = idx; app2.refresh(); },
      },
      { type: "button", id: "move-up", label: "◀", run(app2, sel2) { moveItem(app2, sel2.ref, -1); } },
      { type: "button", id: "move-down", label: "▶", run(app2, sel2) { moveItem(app2, sel2.ref, 1); } },
      { type: "button", id: "add", label: "＋ nó", run(app2, sel2) { addAfter(app2, sel2.ref); } },
      { type: "button", id: "delete", label: "✕", danger: true, run(app2, sel2) { removeItem(app2, sel2.ref, true); } },
    ];
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
    const ctrls = [...formatControls(app)];
    // Data-driven "active/now" marker: a layout whose slots carry an `active` index
    // (agenda's current row) gets an "ativo" toggle per row, setting slots.active to
    // this row (or clearing it). No layout-id branch; roadmap uses its own roadnode.
    const slots = app.cur().slots;
    if (slots && "active" in slots) {
      const list = sel.ref.split(".")[0];
      const idx = (slots[list] || []).findIndex((x) => `${list}.${x.id}` === sel.ref);
      ctrls.push({
        type: "toggle", id: "active", labelKey: "slides.ed_active", on: slots.active === idx,
        write(app2, sel2, checked) { app2.record(); app2.cur().slots.active = checked ? idx : null; app2.refresh(); },
      });
    }
    ctrls.push(
      { type: "button", id: "move-up", label: "▲", run(app2, sel2) { moveItem(app2, sel2.ref, -1); } },
      { type: "button", id: "move-down", label: "▼", run(app2, sel2) { moveItem(app2, sel2.ref, 1); } },
      { type: "button", id: "add", label: `＋ ${t("slides.ed_topic")}`, run(app2, sel2) { addAfter(app2, sel2.ref); } },
      { type: "button", id: "delete", labelKey: "slides.ed_remove", danger: true, run(app2, sel2) { removeItem(app2, sel2.ref, false); } },
    );
    // Deck-wide animation, reachable by clicking an ITEM (not just the hard-to-hit
    // container gap). Skipped for a free stack, which animates via its own .asset.
    const tlist = sel.ref.split(".")[0];
    if (!stackAssetOf(app, tlist)) ctrls.push({ type: "sep" }, ...deckAnimCtrls(app, tlist));
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
    const cr = el.closest && el.closest(".cardrow");
    if (cr) {
      // A free-placed card stack's row carries data-list (its slots key); the Cards
      // LAYOUT's rows carry data-row instead. data-list wins so a free stack resolves
      // to its own key, not the shared "cards" list.
      const list = cr.dataset && cr.dataset.list;
      if (list) return { kind: "container", ref: list };
      const row = Number((cr.dataset && cr.dataset.row) || 0);
      return row ? { kind: "container", ref: "cards", row } : { kind: "container", ref: "cards" };
    }
    const tl = el.closest && el.closest(".topiclist");
    if (tl) {
      const list = (tl.dataset && tl.dataset.list) || "topics";
      return { kind: "container", ref: list };
    }
    return null;
  },
  el(app, sel) {
    if (sel.ref === "cards") return app.stage.querySelector(`.cardrow[data-row="${sel.row || 0}"]`) || app.stage.querySelector(".cardrow");
    // a free stack's container is whatever carries its data-list (a .topiclist OR a .cardrow)
    return app.stage.querySelector(`[data-list="${sel.ref}"]`);
  },
  target(app, sel) {
    return app.cur().slots[sel.ref] || null;
  },
  controls(app, sel) {
    if (sel.ref === "cards") {
      // Cards: add a card to THE CLICKED row, and start a new stack (row) below.
      return [
        { type: "button", id: "add", label: "＋ card", run(app2, sel2) { addItem(app2, "cards", sel2.row || 0); } },
        { type: "button", id: "add-row", label: "＋ linha", run(app2) { addRow(app2); } },
        { type: "sep" },
        ...deckAnimCtrls(app, "cards"), // deck-wide animation (item a item / junto / não), Élder: pro deck inteiro
      ];
    }
    // A free-placed CARD stack: add a card. Detected by the asset variant, so the
    // label + the seeded item match what the user inserted.
    const st = stackAssetOf(app, sel.ref);
    const ctrls = (st && st.variant === "cards")
      ? [{ type: "button", id: "add", label: `＋ ${t("slides.ed_card")}`, run(app2, sel2) { addItem(app2, sel2.ref); } }]
      // Any other named list (topics, left/right, dos/donts, steps, a free Lista, …).
      : [{ type: "button", id: "add", label: sel.ref === "topics" ? "＋ tópico" : "＋ item", run(app2, sel2) { addItem(app2, sel2.ref); } }];
    // Data-driven orientation toggle: any layout whose slots carry an `orientation`
    // (steps row/col) gets a flip on its list bar, no layout-id branch.
    const slots = app.cur().slots;
    if (slots && "orientation" in slots) {
      ctrls.push({
        type: "toggle", id: "orientation", labelKey: "slides.ed_orientation",
        on: slots.orientation === "col",
        write(app2, sel2, checked) { app2.record(); app2.cur().slots.orientation = checked ? "col" : "row"; app2.refresh(); },
      });
    }
    // A layout list (topics / named) is a DECK: its whole-deck animation lives here. A free
    // stack (st truthy) animates as a unit via its own .asset, so it is skipped.
    if (!st) ctrls.push({ type: "sep" }, ...deckAnimCtrls(app, sel.ref));
    return ctrls;
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
