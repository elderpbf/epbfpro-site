// edit/addslide.js: the +slide picker as a modal of LIVE preview cards, grouped
// by category. The flat layout list outgrew a text menu, so each addable slide
// type is shown as a real mini-render of its own default content (reusing the
// player's renderInto, so a new layout gets an accurate preview for FREE, no
// hand-drawn icon to maintain). Built-in layouts and saved layouts (the 4c.1
// library) are ONE concept here: a saved slide is just another card, under the
// "Salvos" group. Mirrors the maskpanel.js extraction so app.js stays thin.
import { t } from "../../../../js/i18n.js";
import { glyphSvg } from "../../../../js/glyphs.js";
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

// Group the library entries by the deck they were shared OUT of (track-35 C, Élder
// 2026-07-17). The section key is the origin slug; entries with no origin (saved by the
// "salvar como layout" button, or from before `from` existed) fall into ONE catch-all
// section rendered last, rather than being hidden or given a fake origin. `deckTitle`
// resolves a slug to its CURRENT title, so renaming a deck renames its section; the title
// stamped at share time is the fallback for a deck that is gone. Pure (testable).
export function groupTemplates(templates, deckTitle) {
  const buckets = new Map();
  for (const tpl of templates) {
    const slug = (tpl.from && tpl.from.slug) || null;
    const key = slug || "__none__";
    if (!buckets.has(key)) {
      const live = slug && deckTitle ? deckTitle(slug) : null;
      buckets.set(key, { key, slug, title: live || (tpl.from && tpl.from.title) || "", items: [] });
    }
    buckets.get(key).items.push(tpl);
  }
  const out = [...buckets.values()].filter((b) => b.key !== "__none__");
  out.sort((a, b) => a.title.localeCompare(b.title));
  if (buckets.has("__none__")) out.push(buckets.get("__none__"));
  return out;
}

export function addSlidePanelHTML() {
  return `
<div id="add-slide-overlay" style="display:none">
  <div id="add-slide-box">
    <div class="as-head">
      <span class="as-title">${t("slides.add_slide_title")}</span>
      <div class="as-tabs" role="tablist">
        <button class="as-tab is-on" type="button" data-tab="tpl" role="tab">${t("slides.add_tab_templates")}</button>
        <button class="as-tab" type="button" data-tab="lib" role="tab">${t("slides.add_tab_library")}</button>
      </div>
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
    // Scale the 1280-wide render down to the box width. The box can be 0-width at
    // build time (the modal is still display:none while the saved layouts load),
    // and a bare rAF then silently skips, leaving the render unscaled (cropped to
    // the corner, the bug). So apply now AND, if there is no width yet, again the
    // moment the box first gets one, then stop observing.
    const fit = () => {
      const w = prev.clientWidth;
      if (!w) return false;
      scale.style.transform = `scale(${w / app.deck().canvas.w})`;
      return true;
    };
    if (!fit() && typeof ResizeObserver === "function") {
      const ro = new ResizeObserver(() => { if (fit()) ro.disconnect(); });
      ro.observe(prev);
    }
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

  // A SAVED-layout card: the live-preview card (body click = insert) wrapped with a
  // hover action bar that manages the template itself. "editar" inserts it for
  // manual editing (the next save-as-layout overwrites it); "renomear" and
  // "excluir" hit the library and rebuild the modal so the Salvos grid refreshes.
  // Built-in cards have no action bar (they are not editable).
  function savedCard(tpl) {
    const wrap = document.createElement("div");
    wrap.className = "as-card-wrap";
    const slide = { ...tpl.slide, id: "__prev_" + tpl.id };
    // Body = insert LINKED. This tab is the shared library, so the obvious gesture is the
    // shared one; "inserir solto" is an action, not the default. (Before the tabs, the
    // saved cards lived in a "Salvos" group of the layout picker and the body inserted a
    // detached copy; nothing carries over, because the group no longer exists.)
    wrap.appendChild(card(tpl.name || tpl.layout, slide, () => app.linkTemplate(tpl)));
    const acts = document.createElement("div");
    acts.className = "as-actions";
    // `isHtml` = the label is markup (an svg from the glyph library), not a text glyph.
    // textContent for the rest, so a translated title can never inject markup.
    const mkBtn = (glyph, title, onClick, isHtml) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "as-act";
      b.title = title;
      if (isHtml) b.innerHTML = glyph;
      else b.textContent = glyph;
      b.addEventListener("click", onClick);
      acts.appendChild(b);
    };
    // The other insertion mode: a detached copy. Same store, same card, two modes (the
    // "Copiar | Vincular" of track-35 C); the body owns the linked one.
    mkBtn(glyphSvg("copy", { size: 13 }), t("slides.shr_loose"), (e) => {
      e.stopPropagation();
      app.insertTemplate(tpl);
      close();
    }, true);
    mkBtn("✎", t("slides.tpl_edit"), (e) => {
      e.stopPropagation();
      app.editTemplate(tpl);
      close();
    });
    mkBtn("Aa", t("slides.tpl_rename"), async (e) => {
      e.stopPropagation();
      // eslint-disable-next-line no-alert
      const name = window.prompt(t("slides.tpl_rename_prompt"), tpl.name || "");
      if (name == null) return;
      await app.renameTemplate(tpl.id, name);
      open();
    });
    mkBtn("🗑", t("slides.tpl_delete"), async (e) => {
      e.stopPropagation();
      // eslint-disable-next-line no-alert
      if (!window.confirm(t("slides.tpl_delete_confirm"))) return;
      await app.deleteTemplate(tpl.id);
      open();
    });
    wrap.appendChild(acts);
    return wrap;
  }

  // TEMPLATES tab: the built-in layouts, grouped by category. Every insert lands right
  // AFTER the slide picked on the rail (app.addSlide splices at index+1), never at the end.
  function renderTemplates() {
    host.innerHTML = "";
    for (const g of groupLayouts(registry.list())) {
      const grid = groupBlock(groupLabel(g.key));
      for (const L of g.items) {
        const slide = { id: "__prev_" + L.id, layout: L.id, slots: L.defaults() };
        grid.appendChild(card(labelOf(L), slide, () => app.addSlide(L.id)));
      }
    }
  }

  // BIBLIOTECA tab: the shared slides, sectioned by the deck each was shared out of.
  // The card BODY inserts a LINK here, the inverse of the old "Salvos" group: this tab IS
  // the shared library, so linking is what it is for. "inserir solto" stays one action away.
  async function renderLibrary() {
    host.innerHTML = "";
    if (!app._library) return;
    let templates = [];
    try { templates = await app._library.list(); } catch (_) { templates = []; }
    if (!templates.length) {
      host.innerHTML = `<div class="as-empty">${t("slides.add_lib_empty")}</div>`;
      return;
    }
    for (const g of groupTemplates(templates, app._deckTitleOf)) {
      const grid = groupBlock(g.title || t("slides.add_lib_nodeck"));
      for (const tpl of g.items) grid.appendChild(savedCard(tpl));
    }
  }

  let _tab = "tpl";
  async function open() {
    // Show the modal BEFORE rendering: the preview cards scale against their box width,
    // and a display:none box measures 0 (the old cropped-to-the-corner bug).
    overlay.style.display = "";
    overlay.querySelectorAll(".as-tab").forEach((b) => b.classList.toggle("is-on", b.dataset.tab === _tab));
    if (_tab === "tpl") renderTemplates();
    else await renderLibrary();
  }
  function close() { overlay.style.display = "none"; }

  app.openAddSlide = () => { _tab = "tpl"; return open(); };

  overlay.querySelectorAll(".as-tab").forEach((b) => {
    b.addEventListener("click", () => { _tab = b.dataset.tab; open(); });
  });
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
