// edit/animpanel.js — the "Animação" panel: entrance type + the reveal list + Preview.
// Opened from the chrome "Animação" button, like the Tema box. It lists EVERY animatable
// unit with its true state (so it matches reality). To keep each row compact the on/off and
// the entrance effect fold into droplists: a singleton shows ONE droplist (Off / Surgir /
// Fade / Deslizar / Zoom) whose closed button reads "Animar" when off and the effect name
// otherwise, plus a ＋junto glyph (enter with the previous unit); a deck shows a mode droplist
// (Off / item a item / tudo junto) plus, when on, the same effect droplist. "Surgir" is the
// default entrance (the deck-wide rise+fade). Animated units come first, in reveal order, and
// reorder by DRAG (grab handle) only; off units follow, dimmed. "Ligar todos / Desligar todos"
// flips everything. Preview steps THIS slide in the editor (app.startPreview); while previewing
// the panel collapses to just a Parar button so the slide is visible. Everything writes through
// app.anim* (materializes slide.build on first edit) and the panel re-renders after each change.
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

// A compact custom dropdown: a button reading `btnLabel` that opens a menu of [value,label]
// options; picking one calls onPick(value). The panel rebuilds itself after each change
// (app._afterAnim), so we don't persist menu state — a rebuild closes it. Opening one closes
// the other menus in the same panel. Custom (not a native <select>) because the closed button
// must read differently from its option ("Off" in the list, "Animar" on the button).
function dropdown(cls, btnLabel, options, current, onPick) {
  const wrap = el("div", "ap-dd" + (cls ? " " + cls : ""));
  const b = el("button", "ap-ddbtn", btnLabel);
  b.type = "button";
  const menu = el("div", "ap-ddmenu");
  menu.hidden = true;
  options.forEach(([v, lbl]) => {
    const o = el("button", "ap-ddopt" + (v === current ? " on" : ""), lbl);
    o.type = "button";
    o.onclick = (e) => { e.stopPropagation(); onPick(v); };
    menu.appendChild(o);
  });
  b.onclick = (e) => {
    e.stopPropagation();
    const box = wrap.closest(".cdx-animpanel");
    if (box) box.querySelectorAll(".ap-ddmenu").forEach((m) => { if (m !== menu) m.hidden = true; });
    menu.hidden = !menu.hidden;
  };
  wrap.appendChild(b);
  wrap.appendChild(menu);
  return wrap;
}

// Entrance effects. "surgir" = the default rise+fade (the deck-wide entrance), i.e. an ON unit
// with no explicit fx override. Built as FUNCTIONS, not constants: t() must be read at render
// time, not at module load, or the labels freeze in whatever language was active on first import
// and the toggle stops moving them (Élder 2026-07-16: "palavras em português com a língua em
// inglês"). "Off" stays literal, it reads the same in both.
const FX_OPTS = () => [["surgir", t("slides.fx_surgir")], ["fade", t("slides.fx_fade")],
  ["slide", t("slides.fx_slide")], ["zoom", t("slides.fx_zoom")]];
const FX_LABEL = (fx) => t("slides.fx_" + (fx || "surgir"));

// One row. `onList` is the current ordered ON units (for the drag reorder math).
function unitRow(app, u, onList) {
  const on = u.on;
  const key = unitKey(u);
  const row = el("div", "ap-row" + (u.kind === "deck" ? " ap-deck" : "") + (on ? "" : " ap-offrow"));
  if (on) {
    row.draggable = true;
    row.dataset.key = key;
    row.ondragstart = (e) => { dragKey = key; try { e.dataTransfer.effectAllowed = "move"; } catch (_) {} };
    row.ondragover = (e) => { e.preventDefault(); row.classList.add("ap-over"); };
    row.ondragleave = () => row.classList.remove("ap-over");
    row.ondrop = (e) => {
      e.preventDefault();
      row.classList.remove("ap-over");
      if (dragKey == null || dragKey === key) return;
      const keys = onList.map(unitKey).filter((k) => k !== dragKey);
      keys.splice(keys.indexOf(key), 0, dragKey); // drop BEFORE this row
      dragKey = null;
      app.animReorder(keys);
    };
    row.appendChild(el("span", "ap-grab", "⋮⋮"));
  } else {
    row.appendChild(el("span", "ap-grab ap-grab-off", "⋮⋮"));
  }

  row.appendChild(el("span", "ap-label", u.label));

  const ctl = el("span", "ap-ctl");
  const meta = (app.cur().buildFx && app.cur().buildFx[key]) || {};
  const fx = meta.fx || "";

  if (u.kind === "deck") {
    // Mode droplist: Off / item a item / tudo junto. Closed button reads "Animar" when off.
    const mode = u.mode || "none";
    const modeLbl = mode === "each" ? t("slides.ed_anim_each")
      : mode === "unit" ? t("slides.ed_anim_unit") : t("slides.ed_animate");
    ctl.appendChild(dropdown("ap-mode", modeLbl,
      [["none", "Off"], ["each", t("slides.ed_anim_each")], ["unit", t("slides.ed_anim_unit")]],
      mode, (v) => app.animListMode(u.list, v)));
    // Effect droplist (only when animated); a deck's timing (each/unit) is separate from its effect.
    if (on) ctl.appendChild(dropdown("ap-fxdd", FX_LABEL(fx), FX_OPTS(), fx || "surgir",
      (v) => app.animFx(key, v === "surgir" ? null : v)));
  } else {
    // Singleton: ONE droplist folding on/off + effect. Off → "Animar"; else the effect name.
    const cur = on ? (fx || "surgir") : "off";
    const btnLbl = on ? FX_LABEL(fx) : t("slides.ed_animate");
    ctl.appendChild(dropdown("ap-fxdd", btnLbl, [["off", "Off"], ...FX_OPTS()], cur, (v) => {
      if (v === "off") { if (on) app.animToggle(u.key, false); return; }
      if (v === "surgir") { if (on) app.animFx(u.key, null); else app.animToggle(u.key, true); return; }
      if (!on) app.animToggle(u.key, true);
      app.animFx(u.key, v);
    }));
    // ＋junto: a glyph toggle (ON singletons only), orthogonal to the effect.
    if (on) {
      const w = meta.timing === "with";
      const j = btn("ap-with", "⇤", w, () => app.animTiming(u.key, w ? "after" : "with"));
      j.title = t("slides.ed_with_prev");
      ctl.appendChild(j);
    }
  }
  row.appendChild(ctl);
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

  // Transição slide-a-slide (deck-level, Phase 9): Nenhuma / Fade / Empurrar.
  const tr = el("section", "ap-sec");
  tr.appendChild(el("div", "ap-sec-h", t("slides.ed_transition")));
  const tro = el("div", "ap-ent");
  const curT = app.deck().transition || "none";
  [["none", t("slides.tr_none")], ["fade", t("slides.tr_fade")], ["push", t("slides.tr_push")]].forEach(([v, lbl]) =>
    tro.appendChild(btn("ap-ent-o", lbl, curT === v, () => { app.setTransition(v); rebuild(); })));
  tr.appendChild(tro);
  box.appendChild(tr);

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
  else units.forEach((u) => list.appendChild(unitRow(app, u, onList)));
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
