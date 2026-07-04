// edit/animpanel.js — the "Animação" panel: entrance type + the ordered reveal list +
// Preview. Opened from the chrome "Animação" button, like the Tema box. It renders the
// ANIMATED units only (build order); include an element from its own selection bar or
// via "ligar todos", turn one off here to drop it from the list. Rows reorder by drag
// (grab handle) with ▲▼ as a reliable fallback; a deck row also carries item-a-item / tudo
// junto. Everything writes through app.anim* (which materializes slide.build on first
// edit); the panel re-renders itself after each change and registers app._animPanelRefresh
// so a change made from the selection bar reflects here too. Preview steps THIS slide in
// the editor (app.startPreview); closing the panel stops it.
import { t } from "../../../../js/i18n.js";

let panel = null;
let openBtn = null;
let appRef = null;
let onDoc = null;
let dragKey = null;

function el(tag, cls, txt) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
}

function btn(cls, txt, on, onClick) {
  const b = el("button", cls + (on ? " on" : ""), txt);
  b.type = "button";
  b.onclick = (e) => { e.stopPropagation(); onClick(); };
  return b;
}

// One row for an animated unit. `units` is the current ordered list (for reorder math).
function unitRow(app, u, i, units) {
  const row = el("div", "ap-row" + (u.isDeck ? " ap-deck" : ""));
  row.dataset.key = u.key;
  row.draggable = true;
  row.ondragstart = (e) => { dragKey = u.key; try { e.dataTransfer.effectAllowed = "move"; } catch (_) {} };
  row.ondragover = (e) => { e.preventDefault(); row.classList.add("ap-over"); };
  row.ondragleave = () => row.classList.remove("ap-over");
  row.ondrop = (e) => {
    e.preventDefault();
    row.classList.remove("ap-over");
    if (dragKey == null || dragKey === u.key) return;
    const keys = units.map((x) => x.key).filter((k) => k !== dragKey);
    keys.splice(keys.indexOf(u.key), 0, dragKey); // drop BEFORE the target row
    dragKey = null;
    app.animReorder(keys);
  };

  row.appendChild(el("span", "ap-grab", "⋮⋮"));
  row.appendChild(el("span", "ap-label", u.label));

  if (u.isDeck) {
    const mode = el("span", "ap-mode");
    mode.appendChild(btn("ap-m", t("slides.ed_anim_each"), u.mode === "each", () => app.animListMode(u.list, "each")));
    mode.appendChild(btn("ap-m", t("slides.ed_anim_unit"), u.mode === "unit", () => app.animListMode(u.list, "unit")));
    row.appendChild(mode);
  }

  const ord = el("span", "ap-ord");
  const move = (dir) => {
    const keys = units.map((x) => x.key);
    const j = i + dir;
    if (j < 0 || j >= keys.length) return;
    [keys[i], keys[j]] = [keys[j], keys[i]];
    app.animReorder(keys);
  };
  ord.appendChild(btn("ap-mv", "▲", false, () => move(-1)));
  ord.appendChild(btn("ap-mv", "▼", false, () => move(1)));
  row.appendChild(ord);

  row.appendChild(btn("ap-off", "✕", false, () => app.animRemoveUnit(u.key)));
  return row;
}

function build(app) {
  const box = el("div", "cdx-animpanel");

  const head = el("div", "ap-head");
  head.appendChild(el("span", "ap-title", t("slides.ed_anim")));
  const x = btn("ap-x", "✕", false, closeAnimPanel);
  head.appendChild(x);
  box.appendChild(head);

  // Entrada (entrance type) — reuses deck.theme.anim.
  const ent = el("section", "ap-sec");
  ent.appendChild(el("div", "ap-sec-h", t("slides.ed_anim_entrance")));
  const opts = el("div", "ap-ent");
  const cur = app.deck().theme.anim;
  [["fade-up", "slides.ed_anim_fadeup"], ["fade", "slides.ed_anim_fade"], ["none", "slides.ed_anim_none"]]
    .forEach(([v, k]) => opts.appendChild(btn("ap-ent-o", t(k), cur === v, () => { app.setTheme("anim", v); rebuild(); })));
  ent.appendChild(opts);
  box.appendChild(ent);

  // Ordem de animação — the animated units, in reveal order.
  const ord = el("section", "ap-sec");
  const oh = el("div", "ap-sec-h ap-listh");
  oh.appendChild(el("span", null, t("slides.ed_anim_order")));
  const acts = el("span", "ap-listacts");
  acts.appendChild(btn("ap-act", t("slides.ed_anim_all_on"), false, () => app.animAllOn()));
  acts.appendChild(btn("ap-act", t("slides.ed_anim_all_off"), false, () => app.animAllOff()));
  oh.appendChild(acts);
  ord.appendChild(oh);

  const units = app.animUnits();
  const list = el("div", "ap-list");
  if (!units.length) list.appendChild(el("div", "ap-empty", t("slides.ed_anim_empty")));
  else units.forEach((u, i) => list.appendChild(unitRow(app, u, i, units)));
  ord.appendChild(list);
  box.appendChild(ord);

  // Preview
  const foot = el("div", "ap-foot");
  foot.appendChild(btn("ap-preview", "▷ " + t("slides.ed_preview"), false, () => app.startPreview()));
  box.appendChild(foot);

  return box;
}

function place(btnEl) {
  const r = btnEl.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  panel.style.visibility = "hidden";
  requestAnimationFrame(() => {
    let left = r.left;
    if (left + panel.offsetWidth > vw - 8) left = Math.max(8, vw - panel.offsetWidth - 8);
    panel.style.left = left + "px";
    panel.style.top = r.bottom + 6 + "px";
    panel.style.visibility = "";
  });
}

// Rebuild in place (keeps the panel open + anchored) after a change.
function rebuild() {
  if (!panel || !appRef || !openBtn) return;
  const next = build(appRef);
  panel.replaceWith(next);
  panel = next;
  place(openBtn);
}

export function closeAnimPanel() {
  if (!panel) return;
  panel.remove();
  panel = null;
  openBtn = null;
  if (onDoc) { document.removeEventListener("mousedown", onDoc, true); onDoc = null; }
  if (appRef) { appRef._animPanelRefresh = null; if (appRef.previewing) appRef.stopPreview(); }
  appRef = null;
}

/** Open (or toggle) the Animação panel anchored under `btn`. */
export function openAnimPanel(app, btnEl) {
  if (panel && openBtn === btnEl) { closeAnimPanel(); return; }
  closeAnimPanel();
  appRef = app;
  panel = build(app);
  openBtn = btnEl;
  app.root.appendChild(panel);
  place(btnEl);
  app._animPanelRefresh = rebuild; // reflect changes made from the selection bar
  onDoc = (e) => {
    if (panel.contains(e.target) || (btnEl && btnEl.contains(e.target))) return;
    closeAnimPanel();
  };
  document.addEventListener("mousedown", onDoc, true);
}
