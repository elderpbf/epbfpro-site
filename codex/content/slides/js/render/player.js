// render/player.js — pure rendering: slide HTML, asset layer, freeform overrides,
// reveal-step visibility, and scale-to-fit math. No state of its own; the app
// controller calls these. The engine never switches on a layout id (it asks the
// registry for the slide's layout and calls render()).
import * as registry from "../layouts/registry.js";
import { maskOverlay, topicList } from "./helpers.js";
import { cardList } from "./cardparts.js";
import { DEFAULT_LOGO, resolveStyleObj } from "../core/schema.js";
import { planSteps, seedBuild, parseListKey, listModeOf, isAnimated, keyOfList } from "./animsteps.js";
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
    // The stack's items live in slots[listKey]; rendering the shared list renderer
    // there makes them selectable/editable/addable through the existing kinds with no
    // bespoke wiring (the row carries data-list=listKey, items are keyed by it). The
    // variant picks the item shape: "cards" -> cardList (composable cards), else a
    // topicList of bullets.
    const items = (slide && slide.slots && slide.slots[a.listKey]) || [];
    return a.variant === "cards" ? cardList(items, a.listKey) : topicList(items, a.listKey);
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

/**
 * Extract the slide's ordered reveal BLOCKS from the stage, in DOM order, skipping any
 * candidate nested inside another (an image part inside a card, a card inside a free
 * stack) so the outer block owns the step. Each descriptor carries { el, list, key, def }:
 *   - a free asset  -> a singleton keyed "a:<id>" (def true)
 *   - a filled image slot -> a singleton keyed "f:<fkey>" (def true)
 *   - a list item (topic / card / roadnode: has data-step + fkey) -> { list: "<name>" }
 *   - a free text box (.editable[data-fkey], no data-step) -> singleton "f:<fkey>", def
 *     FALSE, so titles/subtitles stay fixed by default but can be opted in.
 * The SAME extraction feeds autoSteps (which numbers them) and animSeed (which snapshots
 * the auto order), so both agree on identity. Structural neutralized candidates get their
 * reveal cleared here.
 */
function blocksOf(stage) {
  const SEL = "[data-step], .asset, .imgslot.filled, .editable[data-fkey]";
  const all = [...stage.querySelectorAll(SEL)];
  const nested = (el) => all.some((o) => o !== el && o.contains(el));
  const blocks = [];
  for (const el of all) {
    if (nested(el)) { el.classList.remove("reveal"); el.dataset.step = "0"; continue; }
    const d = el.dataset;
    if (el.classList.contains("asset")) blocks.push({ el, list: null, key: "a:" + d.asset, def: true });
    else if (el.classList.contains("imgslot")) blocks.push({ el, list: null, key: "f:" + d.fkey, def: true });
    // A list ITEM is a topic/roadnode <li> or a .card, keyed "<list>.<id>". Classify by
    // being that element, NOT by data-step presence: layouts stamp data-step on fixed
    // slots (title/subtitle) too, and those must stay text singletons, not fake decks.
    else if ((el.tagName === "LI" || el.classList.contains("card")) && d.fkey) blocks.push({ el, list: d.fkey.split(".")[0], key: null, def: true });
    else if (el.classList.contains("editable") && d.fkey) blocks.push({ el, list: null, key: "f:" + d.fkey, def: false }); // free text box: fixed by default
    else blocks.push({ el, list: null, key: d.fkey ? "f:" + d.fkey : null, def: true });
  }
  return blocks;
}

/**
 * Number the reveal steps for the current slide. Delegates the ORDER + grouping decision
 * to the pure animsteps.planSteps: with no slide.build it is the validated auto behaviour
 * (every default block one-by-one in DOM order); with a build it follows that explicit
 * ordered plan (per-element include/exclude, per-deck item-a-item vs unit, reorder).
 * Returns the step count (the slide's max step). This is the ONE source of truth for
 * order + count; layouts emit content, never step-truth.
 */
export function autoSteps(stage, build, buildFx) {
  const blocks = blocksOf(stage);
  const { steps, count } = planSteps(blocks.map((b) => ({ list: b.list, key: b.key, def: b.def })), build, buildFx);
  blocks.forEach((b, i) => {
    if (steps[i] > 0) {
      b.el.classList.add("reveal");
      b.el.dataset.step = String(steps[i]);
      // Phase 9: per-unit entrance effect (fade/slide/zoom) from slide.buildFx, keyed by the
      // unit's build key (a singleton key, or the list's each:/unit: key). Absent -> the
      // deck-wide entrance (#stage[data-anim]) still applies.
      const uk = b.key || (b.list ? keyOfList(build, b.list) : null);
      const meta = (uk && buildFx && buildFx[uk]) || null;
      if (meta && meta.fx) b.el.dataset.fx = meta.fx; else delete b.el.dataset.fx;
      if (meta && meta.dur) b.el.style.setProperty("--rvdur", meta.dur + "ms"); else b.el.style.removeProperty("--rvdur");
    } else { b.el.classList.remove("reveal"); b.el.dataset.step = "0"; delete b.el.dataset.fx; b.el.style.removeProperty("--rvdur"); }
  });
  return count;
}

/** Snapshot the current AUTO reveal order as an explicit build array (materialization),
 *  so the selection controls can turn "no build" into an editable ordered plan without
 *  changing what the slide currently shows. */
export function animSeed(stage) {
  return seedBuild(blocksOf(stage));
}

/** Every block as an explicit build (free text boxes included) — the "ligar todos" seed. */
export function animAll(stage) {
  return seedBuild(blocksOf(stage), true);
}

/** ALL animatable units for the panel, each with its TRUE on/off state, so the list
 *  matches reality. A deck (a whole list) is one unit carrying its mode ("each"|"unit"|
 *  "none"); a singleton (image / free text / asset) carries on/off. Ordered: animated
 *  units in reveal order first (build order, or DOM order in auto), then the OFF units in
 *  DOM order. Returns [{ kind:"deck"|"single", label, on, mode?, list?, key? }].
 */
export function animUnits(stage, build) {
  const blocks = blocksOf(stage);
  const units = [];
  const seen = new Set();
  for (const b of blocks) {
    if (b.list) {
      if (seen.has(b.list)) continue;
      seen.add(b.list);
      const mode = listModeOf(build, b.list);
      units.push({ kind: "deck", list: b.list, label: deckLabel(b.list), mode, on: mode !== "none" });
    } else if (b.key) {
      units.push({ kind: "single", key: b.key, label: singletonLabel(b), on: isAnimated(build, b.key, b.def) });
    }
  }
  if (build) {
    const find = (k) => {
      const lk = parseListKey(k);
      return lk ? units.find((u) => u.kind === "deck" && u.list === lk.list)
                : units.find((u) => u.kind === "single" && u.key === k);
    };
    const ordered = [];
    const used = new Set();
    for (const k of build) { const u = find(k); if (u && !used.has(u)) { ordered.push(u); used.add(u); } }
    for (const u of units) if (!used.has(u)) ordered.push(u);
    return ordered;
  }
  return [...units.filter((u) => u.on), ...units.filter((u) => !u.on)]; // auto: on (DOM order) then off
}

function deckLabel(list) {
  if (list === "topics") return t("slides.ed_topic");
  if (list === "cards") return t("slides.ed_card");
  return list;
}

function singletonLabel(blk) {
  if (!blk || !blk.el) return t("slides.ed_text");
  const c = blk.el.classList;
  if (c.contains("imgslot") || c.contains("a-image") || c.contains("a-photo")) return t("slides.ed_image");
  if (c.contains("a-video")) return t("slides.ed_video");
  if (c.contains("a-stack")) return t("slides.ed_list");
  const s = (blk.el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 24);
  return s ? `${t("slides.ed_text")}: ${s}` : t("slides.ed_text");
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

/**
 * Scale the whole stage to fit its wrapper (resolution-on-the-fly). `pad` is the
 * breathing room (px) left around the slide in the editor; presenting passes 0 so the
 * slide reaches the viewport edges (only the 16:9 letterbox remains).
 */
export function fit(stagewrap, stagebox, stage, canvas, pad = 40) {
  const s = Math.min((stagewrap.clientWidth - pad) / canvas.w, (stagewrap.clientHeight - pad) / canvas.h);
  if (stagebox) {
    stagebox.style.width = canvas.w * s + "px";
    stagebox.style.height = canvas.h * s + "px";
  }
  stage.style.transform = `scale(${s})`;
  return s;
}

/**
 * Phase 8 reflow: shrink the slide's font to fit the canvas when flow content overflows.
 * All slide font sizes are calc(... * var(--fontScale) * var(--fitScale, 1)), so setting
 * --fitScale on the stage scales every text size uniformly, with no per-layout branching.
 * Measures at natural size, then applies 1/overflow (floored at 0.5) in a single pass:
 * font tracks height ~linearly for text, so one correction fits. Absolute assets keep
 * their size (they are clamped separately, not reflowed).
 */
export function fitToCanvas(stage, canvas) {
  if (!stage || !canvas) return 1;
  stage.style.setProperty("--fitScale", "1"); // measure at natural (unfitted) size
  const over = Math.max(stage.scrollWidth / canvas.w, stage.scrollHeight / canvas.h);
  const k = over > 1.002 ? Math.max(0.5, 1 / over) : 1;
  stage.style.setProperty("--fitScale", String(Math.round(k * 1000) / 1000));
  return k;
}
