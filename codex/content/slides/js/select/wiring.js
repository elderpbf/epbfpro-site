// select/wiring.js  (SLIDES-EDITOR-INTERNAL, see selection.js scope lock)
//
// Glue that turns the model + descriptors + bar into a working surface:
//   - builds the selection FRAME (box + handles) in #stagebox, above the stage;
//   - owns stage selection (match -> select, arm a move) for EVERY selectable kind
//     (asset, logo, text/image slots, card, topic, container, divider);
//   - dispatches geometry to per-kind STRATEGIES via begin/live/commit gestures
//     (model mutate + one-element inline patch per tick, full re-render only on
//     release) with a unique per-gesture undo token (no cross-drag coalescing);
//   - re-resolves the selection from its logical ref after every render / undo.
import { createSelection } from "./selection.js";
import { createBar } from "./bar.js";
import * as kinds from "./kinds.js";
import { strategies, geometryCaps } from "./geometry.js";
import { t } from "../../../../js/i18n.js";

const DEG = Math.PI / 180;
const MIN_W = 24;
const MIN_H = 18;
const DRAG_THRESHOLD = 3; // px before a select turns into a move
let _gid = 0; // unique per-gesture id so two drags never coalesce into one undo

const rotate = (px, py, a) => {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: px * c - py * s, y: px * s + py * c };
};

function onDrag(onMove, onUp) {
  const move = (ev) => onMove(ev);
  const up = (ev) => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    if (onUp) onUp(ev);
  };
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
}

export function initSelect(app) {
  if (app.isPresenter) return;
  const sel = createSelection();
  const bar = createBar(app);

  /* ---------- the selection frame (mirrors freeform's flayer pattern) ---------- */
  const layer = document.createElement("div");
  layer.className = "sellayer";
  const scale = document.createElement("div");
  scale.className = "selscale";
  const box = document.createElement("div");
  box.className = "selbox";
  box.style.display = "none";
  box.innerHTML =
    [
      [-1, -1], [0, -1], [1, -1],
      [-1, 0], [1, 0],
      [-1, 1], [0, 1], [1, 1],
    ]
      .map(([x, y]) => `<div class="selh" data-h="${x},${y}"></div>`)
      .join("") + `<div class="selh selrot" data-h="rot" title="${t("slides.ed_rotate")}"></div>`;
  scale.appendChild(box);
  layer.appendChild(scale);
  app.stagebox.appendChild(layer); // persists across stage re-renders
  const syncScale = () => (scale.style.transform = `scale(${app.scaleNow()})`);

  /* ---------- lookups off the current selection ---------- */
  function desc() {
    const r = sel.get();
    return r ? kinds.get(r.kind) : null;
  }
  function strat() {
    const d = desc();
    return d ? strategies[d.geometry] : null;
  }
  function caps() {
    const d = desc();
    const r = sel.get();
    const s = app.cur().slots;
    const cp = geometryCaps(d ? d.geometry : null, s && s.stacked); // flowCard flips to vertical resize when stacked
    // A card in a FREE-PLACED stack (ref list != "cards") has no per-card resize: the
    // whole stack sizes via its asset box, so drop its resize handles (no dead handle).
    if (r && r.kind === "card" && r.ref && r.ref.split(".")[0] !== "cards") {
      return { ...cp, resizeW: false, resizeH: false };
    }
    return cp;
  }
  function curEl() {
    const d = desc();
    return d ? d.el(app, sel.get()) : null;
  }

  function placeBox() {
    const el = curEl();
    const st = strat();
    // Hide (do NOT clear) when the element is transiently unresolved. Clearing here
    // nulled the live selection mid-drag, so the next gesture tick wrote geometry
    // with a null ref (the geometry.js crash). afterRender owns the genuine
    // "element is gone" clear; placeBox should only ever reposition or hide.
    if (!el || !st) { box.style.display = "none"; return; }
    syncScale();
    const g = st.read(app, sel.get(), el);
    const sc = app.scaleNow();
    const cp = caps();
    box.style.display = "block";
    box.style.left = g.x + "px";
    box.style.top = g.y + "px";
    box.style.width = g.w + "px";
    box.style.height = g.h + "px";
    box.style.transform = `rotate(${g.rot || 0}deg)`;
    box.style.setProperty("--hs", 11 / sc + "px"); // handles ~constant on screen
    box.querySelectorAll(".selh").forEach((h) => {
      const k = h.dataset.h;
      let on;
      if (k === "rot") on = !!cp.rotate;
      else {
        const [hx, hy] = k.split(",").map(Number);
        on = (hx !== 0 && cp.resizeW) || (hy !== 0 && cp.resizeH);
      }
      h.style.display = on ? "block" : "none";
    });
  }

  // The element the format controls act on: a text kind's editEl (the editable
  // text node), else null. Mirrors editor.js focusin, so formatting works whether
  // you single-click-select a text element or double-click to type in it.
  function setActiveEditable() {
    const d = desc();
    app.activeEditable = d && d.editEl ? d.editEl(app, sel.get()) : null;
  }

  function selectRef(rec) {
    sel.set(rec);
    setActiveEditable();
    bar.render(rec); // selection: controls centered in the bar
    placeBox();
  }
  function openMenu(ctrls, btn) {
    clear(); // a selection and an open menu are mutually exclusive
    bar.openMenu(ctrls, btn); // menu: options centered under the menu button
  }
  function clear() {
    sel.clear();
    box.style.display = "none";
    bar.hide();
    if (!app.editing) app.activeEditable = null;
  }
  function afterRender() {
    syncScale();
    if (sel.get()) {
      const el = curEl();
      if (!el) return clear(); // element gone (deleted / logo hidden / slide changed)
      setActiveEditable();
      bar.render(sel.get());
      placeBox();
    } else {
      bar.reposition(); // keep an open menu correctly placed across re-renders
    }
  }

  // public surface used by app.js + descriptors
  // openDropdown keeps the current selection (unlike openMenu, which clears it): the
  // card bar stays put and the menu hangs off its trigger button.
  app.select = { afterRender, clear, current: () => sel.get(), selectRef, openMenu, openDropdown: (ctrls, btn) => bar.openDropdown(ctrls, btn), currentEl: () => curEl() };
  app.selectClear = clear;

  function canvasPoint(ev) {
    const sc = app.scaleNow();
    const sr = app.stage.getBoundingClientRect();
    return { x: (ev.clientX - sr.left) / sc, y: (ev.clientY - sr.top) / sc };
  }

  /* ---------- stage: select asset/logo + arm a move ---------- */
  app.stage.addEventListener("pointerdown", (e) => {
    if (app.presenting) return;
    if (e.target.closest(".selbox") || e.target.closest(".selbar")) return; // own listeners
    const hit = kinds.matchKind(e.target);
    if (!hit) {
      clear(); // clicked empty stage: clear any selection AND dismiss an open menu pill
      return;
    }
    // let the caret work while editing a text asset in place
    if (app.editing && e.target.closest('[contenteditable="true"]')) return;

    selectRef({ kind: hit.kind, ref: hit.ref, slideId: app.cur().id, editing: false });

    const st = strat();
    const cp = caps();
    if (!st || !cp.move) return;
    const el = curEl();
    if (!el) return;

    const sc = app.scaleNow();
    const sx = e.clientX, sy = e.clientY;
    let g0 = null, moved = false;
    const token = "selmove:" + hit.kind + ":" + hit.ref + ":" + ++_gid;
    onDrag(
      (ev) => {
        if (!moved) {
          if (Math.abs(ev.clientX - sx) < DRAG_THRESHOLD && Math.abs(ev.clientY - sy) < DRAG_THRESHOLD) return;
          moved = true;
          app.record(token); // begin: one snapshot for the whole gesture
          g0 = st.read(app, sel.get(), el);
        }
        const g = { ...g0, x: g0.x + (ev.clientX - sx) / sc, y: g0.y + (ev.clientY - sy) / sc };
        st.write(app, sel.get(), g); // live: mutate model
        st.patch(el, g, app); //            + patch the one element (no full render)
        placeBox();
      },
      () => {
        if (moved) {
          app.commit();
          app.renderNav();
          app.broadcast();
        }
      }
    );
  });

  /* ---------- frame handles: resize + rotate ---------- */
  box.addEventListener("pointerdown", (e) => {
    const handle = e.target.closest("[data-h]");
    if (!handle) return;
    e.stopPropagation();
    const el = curEl();
    const st = strat();
    const cp = caps();
    if (!el || !st) return;
    const kind = handle.dataset.h;
    const token = "selgeo:" + kind + ":" + sel.get().ref + ":" + ++_gid;

    if (kind === "rot") {
      if (!cp.rotate) return;
      app.record(token);
      const g0 = st.read(app, sel.get(), el);
      const sc = app.scaleNow();
      const sr = app.stage.getBoundingClientRect();
      const ccx = sr.left + (g0.x + g0.w / 2) * sc;
      const ccy = sr.top + (g0.y + g0.h / 2) * sc;
      const a0 = Math.atan2(e.clientY - ccy, e.clientX - ccx);
      const r0 = g0.rot || 0;
      return onDrag(
        (ev) => {
          let deg = r0 + (Math.atan2(ev.clientY - ccy, ev.clientX - ccx) - a0) / DEG;
          if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
          const g = { ...g0, rot: Math.round(deg) };
          st.write(app, sel.get(), g);
          st.patch(el, g, app);
          placeBox();
        },
        () => { app.commit(); app.renderNav(); app.broadcast(); }
      );
    }

    // resize: keep the opposite anchor fixed in world space (rotation-correct).
    // Only the axes this kind allows move (asset = width, logo = height).
    const [hx, hy] = kind.split(",").map(Number);
    const useX = hx !== 0 && cp.resizeW;
    const useY = hy !== 0 && cp.resizeH;
    if (!useX && !useY) return;
    app.record(token);
    const g0 = st.read(app, sel.get(), el);
    const a = (g0.rot || 0) * DEG;
    const cx = g0.x + g0.w / 2, cy = g0.y + g0.h / 2;
    const off0 = rotate((-hx * g0.w) / 2, (-hy * g0.h) / 2, a);
    const anchor = { x: cx + off0.x, y: cy + off0.y };
    const p0 = canvasPoint(e);
    onDrag(
      (ev) => {
        const p = canvasPoint(ev);
        const dl = rotate(p.x - p0.x, p.y - p0.y, -a);
        const w = useX ? Math.max(MIN_W, g0.w + hx * dl.x) : g0.w;
        const h = useY ? Math.max(MIN_H, g0.h + hy * dl.y) : g0.h;
        const off = rotate((-hx * w) / 2, (-hy * h) / 2, a);
        const g = { ...g0, w, h, x: anchor.x - off.x - w / 2, y: anchor.y - off.y - h / 2 };
        st.write(app, sel.get(), g);
        st.patch(el, g, app); // app threaded so flowCard can mirror the symmetric sibling
        placeBox();
      },
      () => { app.commit(); app.renderNav(); app.broadcast(); }
    );
  });

  // Esc clears the selection (unless editing text)
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sel.get() && !app.editing && !app.presenting) clear();
  });
}
