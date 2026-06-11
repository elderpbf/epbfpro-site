// edit/addslide.js: the +slide picker as a modal of LIVE preview cards, grouped
// by category. The flat layout list outgrew a text menu, so each addable slide
// type is shown as a real mini-render of its own default content (reusing the
// player's renderInto, so a new layout gets an accurate preview for FREE, no
// hand-drawn icon to maintain). Built-in layouts and saved layouts (the 4c.1
// library) are ONE concept here: a saved slide is just another card, under the
// "Salvos" group. Mirrors the maskpanel.js extraction so app.js stays thin.
import { t } from "../../../../js/i18n.js";
import * as registry from "../layouts/registry.js";
import { renderInto } from "../render/player.js";

// Category order for the picker. A layout declares its `group`; an unknown or
// missing one falls into a catch-all "other" bucket rendered last (see groupLayouts).
export const GROUP_ORDER = ["title", "lists", "compare", "media", "cards"];

// Bucket layouts by their `group`, ordered by GROUP_ORDER, empty groups dropped,
// input order preserved within a group. Unknown groups are kept; the "other"
// catch-all is always last. Pure (testable).
export function groupLayouts(layouts) {
  const buckets = new Map();
  for (const L of layouts) {
    const g = L.group || "other";
    if (!buckets.has(g)) buckets.set(g, []);
    buckets.get(g).push(L);
  }
  const out = [];
  for (const key of GROUP_ORDER) {
    if (buckets.has(key)) { out.push({ key, items: buckets.get(key) }); buckets.delete(key); }
  }
  for (const key of [...buckets.keys()].filter((k) => k !== "other")) {
    out.push({ key, items: buckets.get(key) });
  }
  if (buckets.has("other")) out.push({ key: "other", items: buckets.get("other") });
  return out;
}

export function addSlidePanelHTML() {
  return `
<div id="add-slide-overlay" style="display:none">
  <div id="add-slide-box">
    <div class="as-head">
      <span class="as-title">${t("slides.add_slide_title")}</span>
      <button id="add-slide-close" type="button" aria-label="${t("slides.add_close")}">✕</button>
    </div>
    <div id="add-slide-groups"></div>
  </div>
</div>`;
}

const groupLabel = (key) => t("slides.group_" + key);

// initAddSlide(app, root): owns app.openAddSlide (the +slide entry, called from the
// nav rail). Builds the grouped preview grid on open; a card click adds the slide.
export function initAddSlide(app, root) {
  const $ = (sel) => root.querySelector(sel);
  const overlay = $("#add-slide-overlay");
  const host = $("#add-slide-groups");
  if (!overlay || !host) return;

  const labelOf = (L) => (app._layoutLabel ? app._layoutLabel(L) : L.label);

  // A clean deck for previews: real theme + logo + canvas, but NO stray assets, so
  // each card shows only the layout's own default content, nothing from this deck.
  function previewDeck() {
    const d = app.deck();
    return { theme: d.theme, logo: d.logo, canvas: d.canvas, assets: [] };
  }

  // One preview card: a scaled live render of `slide` + a label; onPick adds it.
  function card(labelText, slide, onPick) {
    const btn = document.createElement("button");
    btn.className = "as-card";
    btn.type = "button";
    // .mini reuses the thumbnail treatment (hides editor-only chrome, kills inner
    // pointer events); the white slide background is on .as-prev in the CSS.
    btn.innerHTML = `<span class="as-prev mini"><span class="as-scale"></span></span><span class="as-label">${labelText}</span>`;
    const scale = btn.querySelector(".as-scale");
    renderInto(scale, previewDeck(), slide);
    const prev = btn.querySelector(".as-prev");
    requestAnimationFrame(() => {
      const w = prev.clientWidth;
      if (w) scale.style.transform = `scale(${w / app.deck().canvas.w})`;
    });
    btn.addEventListener("click", () => { onPick(); close(); });
    return btn;
  }

  function groupBlock(labelText) {
    const lab = document.createElement("div");
    lab.className = "as-group-label";
    lab.textContent = labelText;
    const grid = document.createElement("div");
    grid.className = "as-grid";
    host.appendChild(lab);
    host.appendChild(grid);
    return grid;
  }

  async function open() {
    host.innerHTML = "";
    // Built-in layouts, grouped by category.
    for (const g of groupLayouts(registry.list())) {
      const grid = groupBlock(groupLabel(g.key));
      for (const L of g.items) {
        const slide = { id: "__prev_" + L.id, layout: L.id, slots: L.defaults() };
        grid.appendChild(card(labelOf(L), slide, () => app.addSlide(L.id)));
      }
    }
    // Saved layouts (4c.1 library), if any, under "Salvos", just more cards.
    if (app._library) {
      let templates = [];
      try { templates = await app._library.list(); } catch (_) { templates = []; }
      if (templates.length) {
        const grid = groupBlock(groupLabel("saved"));
        for (const tpl of templates) {
          const slide = { ...tpl.slide, id: "__prev_" + tpl.id };
          grid.appendChild(card(tpl.name || tpl.layout, slide, () => app.insertTemplate(tpl)));
        }
      }
    }
    overlay.style.display = "";
  }
  function close() { overlay.style.display = "none"; }

  app.openAddSlide = open;

  $("#add-slide-close").onclick = close;
  // Click the dim backdrop (outside the box) to dismiss.
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });
  // Esc closes while it is open (stop it before the slide-nav / present handlers).
  const onKey = (e) => {
    if (e.key === "Escape" && overlay.style.display !== "none") { e.stopPropagation(); close(); }
  };
  document.addEventListener("keydown", onKey, true);
  app._onAddSlideKey = onKey;
}
