// edit/textstyle.js — the PERSIST side of text styling. (The render side stays in
// player.js: textStyleProps + applyTextStyles.) Block-level format applied from
// the context bar is stored on the model so it survives a re-render: per-asset in
// asset.style, per-LIST-ITEM (card/topic) on the item's own .style via its
// data-style-ref (id-stable, survives reorder), and per-slot in slide.textStyle[path].
// Pure model writers + captureStyle are unit-tested; formatControls returns the bar's
// text-format primitives.
import { resolveStyleObj } from "../core/schema.js";
import { t } from "../../../../js/i18n.js";

export function writeAssetStyle(asset, st) {
  asset.style = st;
  return st;
}
export function writeSlotStyle(slide, path, st) {
  (slide.textStyle = slide.textStyle || {})[path] = st;
  return st;
}

/** Read the block style off a live element (or stub) into a {fs,fw,color} record. */
export function captureStyle(el) {
  return {
    fs: parseFloat(el.style.fontSize) || undefined,
    fw: el.style.fontWeight || undefined,
    color: el.style.color || undefined,
  };
}

// Persist the active editable's current inline style onto the model home.
function persist(app) {
  const el = app.activeEditable;
  if (!el) return;
  const st = captureStyle(el);
  if (el.dataset.aid) {
    const a = app.deck().assets.find((x) => x.id === el.dataset.aid);
    if (a) writeAssetStyle(a, st);
  } else if (el.dataset.styleRef) {
    const obj = resolveStyleObj(app.cur().slots, el.dataset.styleRef); // card/topic item
    if (obj) obj.style = st;
  } else if (el.dataset.path) {
    writeSlotStyle(app.cur(), el.dataset.path, st);
  } else return;
  app.commit();
  app.broadcast();
}

const FS_STEP = 3;
function bumpFont(app, d) {
  const el = app.activeEditable;
  if (!el) return;
  app.record("style");
  el.style.fontSize = parseFloat(getComputedStyle(el).fontSize) + d + "px";
  persist(app);
}

// Set (value = a colour) or clear (value = "") the active editable's colour and
// persist it. Clearing drops the per-item colour so the text re-inherits the theme
// (the swatch is the default source of colour; an item only stores manual pins).
function applyColor(app, value) {
  const el = app.activeEditable;
  if (!el) return;
  app.record("style:color");
  el.style.color = value;
  persist(app);
}

// The deck palette surfaced as ready-made chips, right before the raw "Cor" picker:
// one swatch per real theme colour (Destaque/Texto/Arte) so a single text element can
// borrow a coordinated theme colour in one click, plus a "— do tema —" chip that clears
// the pin so the item follows the swatch again. Pure data; the `swatch` hook paints each
// chip (bar.widget). Reads the LIVE theme at build time, so the chips track the palette.
const PALETTE_CHIPS = [
  { id: "chip-accent", key: "accent", labelKey: "slides.ed_accent", fallback: "#14b8a6" },
  { id: "chip-ink", key: "ink", labelKey: "slides.ed_text_color", fallback: "#134e4a" },
  { id: "chip-art", key: "motif", labelKey: "slides.ed_art", fallback: "#14b8a6" },
];
export function themeColorChips(app) {
  const th = (app && app.deck && app.deck().theme) || {};
  const chips = PALETTE_CHIPS.map((c) => {
    const color = th[c.key] || c.fallback;
    return {
      type: "button", id: c.id, cls: "ctl-chip", swatch: color, title: t(c.labelKey),
      keepFocus: true, run(app2) { applyColor(app2, color); },
    };
  });
  chips.push({
    type: "button", id: "chip-theme", cls: "ctl-chipreset", labelKey: "slides.tb_inherit",
    keepFocus: true, run(app2) { applyColor(app2, ""); },
  });
  return chips;
}

/** Text-format primitives (A− A＋ B · theme chips · Cor) for the context bar. keepFocus
 *  binds on mousedown+preventDefault so the editable keeps focus while you click. They
 *  act on app.activeEditable, the text element the current selection is editing. */
export function formatControls(app) {
  return [
    { type: "button", id: "fs-down", label: "A−", keepFocus: true, run(app) { bumpFont(app, -FS_STEP); } },
    { type: "button", id: "fs-up", label: "A＋", keepFocus: true, run(app) { bumpFont(app, FS_STEP); } },
    {
      type: "button", id: "bold", label: "B", cls: "bold", keepFocus: true,
      run(app) {
        const el = app.activeEditable;
        if (!el) return;
        app.record("style");
        el.style.fontWeight = getComputedStyle(el).fontWeight >= 700 ? "400" : "900";
        persist(app);
      },
    },
    { type: "sep" },
    ...themeColorChips(app),
    {
      type: "color", id: "color", labelKey: "slides.ed_color", value: "#134e4a", keepFocus: true,
      input(app, sel, v) { applyColor(app, v); },
    },
  ];
}
