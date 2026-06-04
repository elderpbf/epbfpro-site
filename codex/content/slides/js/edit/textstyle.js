// edit/textstyle.js — the PERSIST side of text styling. (The render side stays in
// player.js: textStyleProps + applyTextStyles.) Block-level format applied from
// the context bar is stored on the model so it survives a re-render: per-asset in
// asset.style, per-LIST-ITEM (card/topic) on the item's own .style via its
// data-style-ref (id-stable, survives reorder), and per-slot in slide.textStyle[path].
// Pure model writers + captureStyle are unit-tested; formatControls returns the bar's
// text-format primitives.
import { resolveStyleObj } from "../core/schema.js";

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

/** Text-format primitives (A− A＋ B Cor) for the context bar. keepFocus binds on
 *  mousedown+preventDefault so the editable keeps focus while you click. They act
 *  on app.activeEditable, the text element the current selection is editing. */
export function formatControls() {
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
    {
      type: "color", id: "color", labelKey: "slides.ed_color", value: "#134e4a", keepFocus: true,
      input(app, sel, v) {
        const el = app.activeEditable;
        if (!el) return;
        app.record("style:color");
        el.style.color = v;
        persist(app);
      },
    },
  ];
}
