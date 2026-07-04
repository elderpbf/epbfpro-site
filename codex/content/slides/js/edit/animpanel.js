// edit/animpanel.js — the "Animação" panel: entrance type + the reveal list + Preview.
// Opened from the chrome "Animação" button, like the Tema box. It lists EVERY animatable
// unit with its true state (so it matches reality): a deck (a whole list) shows two toggle
// buttons "item a item" / "tudo junto" (the selected one is its mode; neither selected =
// off); a singleton shows one "Animar" toggle (active = animated). Animated units come
// first, in reveal order, and reorder by drag (grab handle) or ▲▼; off units follow,
// dimmed. "Ligar todos / Desligar todos" flips everything. Preview steps THIS slide in the
// editor (app.startPreview); while previewing the panel collapses to just a Parar button so
// the slide is visible. Everything writes through app.anim* (materializes slide.build on
// first edit) and the panel re-renders itself after each change.
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

// Stable identity for a unit in slide.build: a deck by its mode+list, a singleton by key.
function unitKey(u) {
  return u.kind === "deck" ? (u.mode === "unit" ? "unit:" : "each:") + u.list : u.key;
}

// One row. `onList` is the current ordered ON units (for reorder math); `i` is this unit's
// index within it (or -1 when the unit is off, so it carries no reorder controls).
function unitRow(app, u, onList, i) {
  const on = u.on;
  const row = el("div", "ap-row" + (u.kind === "deck" ? " ap-deck" : "") + (on ? "" : " ap-offrow"));
  if (on) {
    row.draggable = true;
    row.dataset.key = unitKey(u);
    row.ondragstart = (e) => { dragKey = unitKey(u); try { e.dataTransfer.effectAllowed = "move"; } catch (_) {} };
    row.ondragover = (e) => { e.preventDefault(); row.classList.add("ap-over"); };
    row.ondragleave = () => row.classList.remove("ap-over");
    row.ondrop = (e) => {
      e.preventDefault();
      row.classList.remove("ap-over");
      if (dragKey == null || dragKey === unitKey(u)) return;
      const keys = onList.map(unitKey).filter((k) => k !== dragKey);
      keys.splice(keys.indexOf(unitKey(u)), 0, dragKey); // drop BEFORE this row
      dragKey = null;
      app.animReorder(keys);
    };
    row.appendChild(el("span", "ap-grab", "⋮⋮"));
  } else {
    row.appendChild(el("span", "ap-grab ap-grab-off", "⋮⋮"));
  }

  row.appendChild(el("span", "ap-label", u.label));

  const ctl = el("span", "ap-ctl");
  if (u.kind === "deck") {
    ctl.appendChild(btn("ap-m", t("slides.ed_anim_each"), u.mode === "each",
      () => app.animListMode(u.list, u.mode === "each" ? "none" : "each")));
    ctl.appendChild(btn("ap-m", t("slides.ed_anim_unit"), u.mode === "unit",
      () => app.animListMode(u.list, u.mode === "unit" ? "none" : "unit")));
  } else {
    ctl.appendChild(btn("ap-m", t("slides.ed_animate"), on,
      () => app.animToggle(u.key, !on)));
  }
  row.appendChild(ctl);

  const ord = el("span", "ap-ord");
  if (on) {
    const move = (dir) => {
      const keys = onList.map(unitKey);
      const j = i + dir;
      if (j < 0 || j >= keys.length) return;
      [keys[i], keys[j]] = [keys[j], keys[i]];
      app.animReorder(keys);
    };
    ord.appendChild(btn("ap-mv", "▲", false, () => move(-1)));
    ord.appendChild(btn("ap-mv", "▼", false, () => move(1)));
  }
  row.appendChild(ord);
  return row;
}

function build(app) {
  // No header: the toolbar button names it, and clicking outside closes it, so we drop the
  // title + ✕ to keep the panel compact (and the Parar control high while previewing).
  const box = el("div", "cdx-animpanel");

  // While previewing, collapse to just a Parar control so the slide stays visible.
  if (app.previewing) {
    const foot = el("div", "ap-foot");
    foot.appendChild(btn("ap-preview ap-stop", "■ " + t("slides.ed_stop"), false, () => app.stopPreview()));
    box.appendChild(foot);
    return box;
  }

  // Entrada (entrance type) — reuses deck.theme.anim.
  const ent = el("section", "ap-sec");
  ent.appendChild(el("div", "ap-sec-h", t("slides.ed_anim_entrance")));
  const opts = el("div", "ap-ent");
  const cur = app.deck().theme.anim;
  [["fade-up", "slides.ed_anim_fadeup"], ["fade", "slides.ed_anim_fade"], ["none", "slides.ed_anim_none"]]
    .forEach(([v, k]) => opts.appendChild(btn("ap-ent-o", t(k), cur === v, () => { app.setTheme("anim", v); rebuild(); })));
  ent.appendChild(opts);
  box.appendChild(ent);

  // Ordem de animação — every unit, animated first (reorderable), then the off ones.
  const ord = el("section", "ap-sec");
  const oh = el("div", "ap-sec-h ap-listh");
  oh.appendChild(el("span", null, t("slides.ed_anim_order")));
  const acts = el("span", "ap-listacts");
  acts.appendChild(btn("ap-act", t("slides.ed_anim_all_on"), false, () => app.animAllOn()));
  acts.appendChild(btn("ap-act", t("slides.ed_anim_all_off"), false, () => app.animAllOff()));
  oh.appendChild(acts);
  ord.appendChild(oh);

  const units = app.animUnits();
  const onList = units.filter((u) => u.on);
  const list = el("div", "ap-list");
  if (!units.length) list.appendChild(el("div", "ap-empty", t("slides.ed_anim_empty")));
  else units.forEach((u) => list.appendChild(unitRow(app, u, onList, u.on ? onList.indexOf(u) : -1)));
  ord.appendChild(list);
  box.appendChild(ord);

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

// Rebuild in place (keeps it open + anchored) after a change or a preview toggle.
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
  app._animPanelRefresh = rebuild; // reflect changes made from the selection bar / preview
  onDoc = (e) => {
    if (panel.contains(e.target) || (btnEl && btnEl.contains(e.target))) return;
    closeAnimPanel();
  };
  document.addEventListener("mousedown", onDoc, true);
}
