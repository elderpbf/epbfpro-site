// render/player.js — pure rendering: slide HTML, asset layer, freeform overrides,
// reveal-step visibility, and scale-to-fit math. No state of its own; the app
// controller calls these. The engine never switches on a layout id (it asks the
// registry for the slide's layout and calls render()).
import * as registry from "../layouts/registry.js";
import { maskOverlay } from "./helpers.js";
import { t } from "../../../../js/i18n.js";

// The logo lives next to the editor modules, not at the page root, so resolve it
// against this module's URL (works the same standalone or mounted inside Codex).
const LOGO_URL = new URL("../../codex-logo.png", import.meta.url).href;

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

const isImageType = (a) => a.type === "image" || a.type === "photo" || a.type == null;

// the media inside a free element, by type (image/photo = <img>, video = <video>,
// text/title = inline-editable block). GIFs animate natively in <img>.
function assetMedia(a) {
  if (a.type === "text" || a.type === "title")
    return `<div class="atext a-${a.type} editable" data-edit="1" data-aid="${a.id}">${a.text || ""}</div>`;
  if (a.type === "video") return `<video src="${a.src}" playsinline controls></video>`;
  return `<img src="${a.src}" draggable="false">${maskOverlay(a.src, a.mask)}`;
}

function assetCtl(a) {
  const sc = (v, l) => `<option value="${v}"${a.scope === v ? " selected" : ""}>${l}</option>`;
  const mask = isImageType(a) ? `<button data-asmask="${a.id}">${t("slides.ed_mask")}</button>` : "";
  return (
    `<div class="assetctl editoronly"><select data-ascope="${a.id}">${sc("slide", t("slides.ed_asset_slide"))}${sc("all", t("slides.ed_asset_all"))}${sc(
      "layout",
      t("slides.ed_asset_layout")
    )}</select>${mask}<button data-asrot="${a.id}:-15">↺</button><button data-asrot="${a.id}:15">↻</button>` +
    `<button data-asdel="${a.id}">✕</button></div>`
  );
}

function assetsHTML(deck, slide) {
  return `<div class="assetlayer">${assetsFor(deck, slide)
    .map(
      (a) =>
        `<div class="asset a-${a.type || "image"}" data-asset="${a.id}" style="left:${a.x}px;top:${a.y}px;width:${a.w}px;transform:rotate(${
          a.rot || 0
        }deg)">${assetMedia(a)}${assetCtl(a)}</div>`
    )
    .join("")}</div>`;
}

// The logo is its own thing: deck-level position (same on every slide), always on
// top, not removable (only hideable per slide), with readability variants.
function logoHTML(deck, slide) {
  const lg = deck.logo || { x: 40, y: 30, h: 40 };
  if (slide.hideLogo) return `<div class="logoshow editoronly" data-logoshow>${t("slides.ed_logo_show")}</div>`;
  const v = slide.logoVariant || "normal";
  const opt = (val, l) => `<option value="${val}"${v === val ? " selected" : ""}>${l}</option>`;
  return (
    `<div class="logo logo-${v}" data-logo style="left:${lg.x}px;top:${lg.y}px;height:${lg.h}px">` +
    `<img src="${LOGO_URL}" alt="PensoIA">` +
    `<div class="logoctl editoronly"><select data-logovar>${opt("normal", t("slides.ed_logo_normal"))}${opt("claro", t("slides.ed_logo_light"))}${opt(
      "escuro",
      t("slides.ed_logo_dark")
    )}${opt("scrim", t("slides.ed_logo_scrim"))}</select><button data-logohide>${t("slides.ed_logo_hide")}</button></div></div>`
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
