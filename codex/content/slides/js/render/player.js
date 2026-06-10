// render/player.js — pure rendering: slide HTML, asset layer, freeform overrides,
// reveal-step visibility, and scale-to-fit math. No state of its own; the app
// controller calls these. The engine never switches on a layout id (it asks the
// registry for the slide's layout and calls render()).
import * as registry from "../layouts/registry.js";
import { maskOverlay, topicList } from "./helpers.js";
import { DEFAULT_LOGO, resolveStyleObj } from "../core/schema.js";
import { t } from "../../../../js/i18n.js";

export { DEFAULT_LOGO };

// The logo lives next to the editor modules, not at the page root, so resolve it
// against this module's URL (works the same standalone or mounted inside Codex).
// The 4 available logos live in ../../assets (relative to this module). Each variant
// maps to a brand SVG already coloured for its background, so no CSS filters are needed.
const logoAsset = (v) => new URL(`../../assets/logo-${["light", "dark", "teal", "mark"].includes(v) ? v : "light"}.png`, import.meta.url).href;

export function layoutOf(slide) {
  return registry.get(slide.layout);
}

/** Effective font scale for a slide: its own override, else the deck default. */
export function effFontScale(deck, slide) {
  return slide.fontScale != null ? slide.fontScale : deck.theme.fontScale;
}

function assetsFor(deck, slide) {
  return deck.assets.filter(
    (a) =>
      a.scope === "all" ||
      (a.scope === "slide" && a.slideId === slide.id) ||
      (a.scope === "layout" && a.layout === slide.layout)
  );
}

// the media inside a free element, by type (image/photo = <img>, video = <video>,
// text/title = inline-editable block, stack = a growable list bound to slots[listKey]).
// GIFs animate natively in <img>.
function assetMedia(a, slide) {
  if (a.type === "stack") {
    // The stack's items live in slots[listKey]; rendering the shared topicList there
    // makes them selectable/editable/addable through the topic + container kinds with
    // no bespoke wiring (the ul carries data-list=listKey, items are keyed by it).
    const items = (slide && slide.slots && slide.slots[a.listKey]) || [];
    return topicList(items, a.listKey);
  }
  if (a.type === "text" || a.type === "title")
    return `<div class="atext a-${a.type} editable" data-edit="1" data-aid="${a.id}">${a.text || ""}</div>`;
  if (a.type === "video") return `<video src="${a.src}" playsinline controls></video>`;
  return `<img src="${a.src}" draggable="false">${maskOverlay(a.src, a.mask)}`;
}

// Free-placed assets: content only. Selection, scope, mask, rotate and delete are
// owned by the unified selection bar (js/select/), not emitted here. A video keeps
// an explicit height since it has no intrinsic box before its metadata loads.
function assetsHTML(deck, slide) {
  return `<div class="assetlayer">${assetsFor(deck, slide)
    .map((a) => {
      const hcss = a.type === "video" && a.h ? `height:${a.h}px;` : "";
      return `<div class="asset a-${a.type || "image"}" data-asset="${a.id}" style="left:${a.x}px;top:${a.y}px;width:${a.w}px;${hcss}transform:rotate(${a.rot || 0}deg)">${assetMedia(a, slide)}</div>`;
    })
    .join("")}</div>`;
}

/**
 * Effective logo for a slide (A1). Per-slide `slide.logo` overrides the deck-level
 * `deck.logo` for geometry and variant; legacy `slide.logoVariant` is honoured for
 * back-compat; everything falls back to DEFAULT_LOGO / "light".
 */
export function resolveLogo(deck, slide) {
  const base = (deck && deck.logo) || DEFAULT_LOGO;
  const per = (slide && slide.logo) || {};
  const deckVar = deck && deck.logo ? deck.logo.variant : undefined;
  return {
    x: per.x != null ? per.x : base.x,
    y: per.y != null ? per.y : base.y,
    h: per.h != null ? per.h : base.h,
    variant: per.variant ?? (slide && slide.logoVariant) ?? deckVar ?? "light",
  };
}

// The logo is its own thing: deck-level position (same on every slide), always on
// top, not removable (only hideable per slide), with readability variants. A1:
// per-slide geometry/variant via slide.logo, resolved centrally by resolveLogo.
// Its controls live in the selection bar, not here.
function logoHTML(deck, slide) {
  if (slide.hideLogo) return `<div class="logoshow editoronly" data-logoshow>${t("slides.ed_logo_show")}</div>`;
  const lg = resolveLogo(deck, slide);
  return (
    `<div class="logo" data-logo style="left:${lg.x}px;top:${lg.y}px;height:${lg.h}px">` +
    `<img src="${logoAsset(lg.variant)}" alt="PensoIA"></div>`
  );
}

export function slideHTML(deck, slide) {
  return layoutOf(slide).render(slide.slots) + assetsHTML(deck, slide) + logoHTML(deck, slide);
}

/**
 * Position a freed element so its visual top-left lands at canvas-space (g.x,g.y)
 * regardless of which positioned ancestor becomes its offset parent. Uses
 * offsetLeft/offsetTop (layout px) so the math is identical at full scale and in
 * scaled thumbnails. `origin` is the coordinate root (the stage, or a mini's
 * .scale box).
 */
export function freedStyle(el, g, origin) {
  el.classList.add("freed");
  el.style.position = "absolute";
  el.style.margin = "0";
  let op = el.offsetParent; // valid now that position is absolute
  let ox = 0,
    oy = 0;
  while (op && op !== origin && origin.contains(op)) {
    ox += op.offsetLeft;
    oy += op.offsetTop;
    op = op.offsetParent;
  }
  el.style.left = g.x - ox + "px";
  el.style.top = g.y - oy + "px";
  el.style.width = g.w + "px";
  if (g.h != null) el.style.height = g.h + "px";
  el.style.transform = `rotate(${g.rot || 0}deg)`;
}

/**
 * Map a stored text style ({fs,fw,color}) to inline CSS props, dropping empties.
 * Block-level formatting from the #fmt toolbar is persisted on the model (per-slot
 * in slide.textStyle[path], per-asset in asset.style) and re-applied on render, so
 * a re-render no longer drops the user's bold / size / colour. Pure: testable.
 */
export function textStyleProps(st) {
  const p = {};
  if (!st) return p;
  if (st.fs != null) p.fontSize = st.fs + "px";
  if (st.fw) p.fontWeight = st.fw;
  if (st.color) p.color = st.color;
  return p;
}

/**
 * Re-apply persisted text styles after a fresh render. Walks editable slots
 * (data-path) and text assets (data-aid) and sets the stored inline style. The
 * element was rebuilt from the model HTML, so it carries no inline style until now.
 */
export function applyTextStyles(scopeEl, deck, slide) {
  const ts = slide.textStyle || {};
  scopeEl.querySelectorAll('[data-path][data-edit="1"]').forEach((el) => {
    if (el.dataset.styleRef) return; // a list item: its style is on the object (below)
    Object.assign(el.style, textStyleProps(ts[el.getAttribute("data-path")]));
  });
  scopeEl.querySelectorAll("[data-style-ref]").forEach((el) => {
    const obj = resolveStyleObj(slide.slots, el.getAttribute("data-style-ref"));
    if (obj) Object.assign(el.style, textStyleProps(obj.style));
  });
  scopeEl.querySelectorAll("[data-aid]").forEach((el) => {
    const a = deck.assets.find((x) => x.id === el.getAttribute("data-aid"));
    if (a) Object.assign(el.style, textStyleProps(a.style));
  });
}

/**
 * Apply per-slide freeform geometry. Any element carrying data-fkey that has an
 * override is lifted out of flow into absolute canvas coordinates; the rest stay
 * in the layout's flow (layouts are seeds, not cages).
 */
export function applyOverrides(scopeEl, slide, origin = scopeEl) {
  const ov = slide.overrides || {};
  scopeEl.querySelectorAll("[data-fkey]").forEach((el) => {
    const g = ov[el.getAttribute("data-fkey")];
    if (!g) {
      el.classList.remove("freed"); // fresh render: in-flow element keeps no inline geometry
      return;
    }
    if (g.flow) flowStyle(el, g);
    else freedStyle(el, g, origin);
  });
}

/**
 * Flow sizing: the element keeps its place in the layout's flex flow but takes a
 * fixed basis + min-height, so its siblings reflow and conform (no overlap).
 * Used for cards in the Cards stack.
 */
export function flowStyle(el, g) {
  el.classList.remove("freed");
  el.style.position = "";
  el.style.left = "";
  el.style.top = "";
  el.style.transform = "";
  el.style.flex = `0 0 ${g.w}px`;
  if (g.h != null) el.style.minHeight = g.h + "px";
}

/** Reveal visibility: in edit mode everything shows; presenting steps through. */
export function applySteps(stage, step, presenting) {
  const all = !presenting;
  stage.querySelectorAll(".reveal").forEach((el) =>
    el.classList.toggle("shown", all || Number(el.dataset.step) <= step)
  );
}

/** Render a fully-revealed slide into a mini element (thumbnails, presenter). */
export function renderInto(el, deck, slide) {
  el.style.setProperty("--fontScale", effFontScale(deck, slide));
  el.innerHTML = slideHTML(deck, slide);
  applyOverrides(el, slide);
  applyTextStyles(el, deck, slide);
  el.querySelectorAll(".reveal").forEach((r) => r.classList.add("shown"));
}

export function scaleOf(stage, canvasW) {
  return stage.getBoundingClientRect().width / canvasW;
}

/** Scale the whole stage to fit its wrapper (resolution-on-the-fly). */
export function fit(stagewrap, stagebox, stage, canvas) {
  const s = Math.min((stagewrap.clientWidth - 40) / canvas.w, (stagewrap.clientHeight - 40) / canvas.h);
  if (stagebox) {
    stagebox.style.width = canvas.w * s + "px";
    stagebox.style.height = canvas.h * s + "px";
  }
  stage.style.transform = `scale(${s})`;
  return s;
}
