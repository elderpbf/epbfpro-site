// edit/freeform.js — the freeform selection + transform layer.
//
// Any element carrying data-fkey can be selected (single click), then moved,
// resized (8 handles, rotation-correct) or rotated. Geometry is written to the
// slide's `overrides` map in canvas coordinates. An element only leaves the
// layout's flow once you actually drag it (selecting alone never reflows); the
// ✕ on the box / Esc returns it to the layout (clears its override).
//
// Layouts stay seeds, not cages — exactly the end-state in ARCHITECTURE / SCRATCH.

import { freedStyle, flowStyle } from "../render/player.js";

const DEG = Math.PI / 180;
const MIN_W = 30;
const MIN_H = 24;
const DRAG_THRESHOLD = 3; // px before a select turns into a move

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

export function initFreeform(app) {
  if (app.isPresenter) return;

  // The overlay lives in #stagebox (NOT #stage), so handles aren't clipped by the
  // stage's overflow:hidden when an element sits at the slide edge. A .fscale child
  // mirrors the stage's scale so the box can be positioned in canvas coordinates.
  const flayer = document.createElement("div");
  flayer.className = "flayer";
  const fscale = document.createElement("div");
  fscale.className = "fscale";
  const fbox = document.createElement("div");
  fbox.className = "fbox";
  fbox.style.display = "none";
  fbox.innerHTML =
    [
      [-1, -1], [0, -1], [1, -1],
      [-1, 0], [1, 0],
      [-1, 1], [0, 1], [1, 1],
    ]
      .map(([x, y]) => `<div class="fh" data-h="${x},${y}"></div>`)
      .join("") +
    `<div class="fh frot" data-h="rot" title="girar"></div>` +
    `<button class="freset" data-h="reset" title="voltar ao layout">✕</button>`;
  fscale.appendChild(fbox);
  flayer.appendChild(fscale);
  app.stagebox.appendChild(flayer); // persists across stage re-renders
  app.flayer = flayer;
  const syncScale = () => (fscale.style.transform = `scale(${app.scaleNow()})`);

  let selFkey = null;

  /* ---------- geometry helpers ---------- */
  function findEl() {
    return selFkey ? app.stage.querySelector(`[data-fkey="${selFkey}"]`) : null;
  }
  function measure(el) {
    const sc = app.scaleNow();
    const sr = app.stage.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: (r.left - sr.left) / sc, y: (r.top - sr.top) / sc, w: r.width / sc, h: r.height / sc, rot: 0 };
  }
  function override(el, create) {
    const ov = (app.cur().overrides = app.cur().overrides || {});
    const k = el.dataset.fkey;
    if (!ov[k] && create) ov[k] = measure(el);
    return ov[k];
  }
  function applyOne(el, g) {
    freedStyle(el, g, app.stage);
  }
  function canvasPoint(ev) {
    const sc = app.scaleNow();
    const sr = app.stage.getBoundingClientRect();
    return { x: (ev.clientX - sr.left) / sc, y: (ev.clientY - sr.top) / sc };
  }
  function dispGeom(el) {
    const ov = override(el, false);
    if (ov && !ov.flow) return ov; // absolute: stored geometry; flow/none: live rect
    return measure(el);
  }

  function placeBox() {
    const el = findEl();
    if (!el) return clear();
    syncScale();
    const g = dispGeom(el);
    const sc = app.scaleNow();
    fbox.style.display = "block";
    fbox.style.left = g.x + "px";
    fbox.style.top = g.y + "px";
    fbox.style.width = g.w + "px";
    fbox.style.height = g.h + "px";
    fbox.style.transform = `rotate(${g.rot || 0}deg)`;
    fbox.style.setProperty("--hs", 11 / sc + "px"); // keep handles ~constant on screen
  }

  function selectEl(el) {
    selFkey = el.dataset.fkey;
    app.selected = { fkey: selFkey };
    placeBox();
  }
  function clear() {
    selFkey = null;
    app.selected = null;
    fbox.style.display = "none";
  }

  /* ---------- selection + move (on the stage) ---------- */
  app.stage.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".fbox")) return; // handled by the handle listener below
    if (e.target.closest("button,select,input,.assetctl,.cardctl,.imgtools,.panhint,.divider,.asset"))
      return; // editor owns these (filled image frames ARE selectable, via data-fkey)
    const el = e.target.closest("[data-fkey]");
    if (!el) {
      clear();
      return;
    }
    if (app.editing && app.activeEditable === el) return; // editing this text: let caret work
    selectEl(el);
    if (el.dataset.fmode === "flow") return; // cards: resize in the stack, never free-move

    // arm a move; only lift out of flow once the pointer actually travels
    const sc = app.scaleNow();
    const sx = e.clientX, sy = e.clientY;
    let g = null, ox = 0, oy = 0, moved = false;
    onDrag(
      (ev) => {
        if (!moved) {
          if (Math.abs(ev.clientX - sx) < DRAG_THRESHOLD && Math.abs(ev.clientY - sy) < DRAG_THRESHOLD) return;
          moved = true;
          app.record("ffmove:" + el.dataset.fkey);
          g = override(el, true);
          ox = g.x;
          oy = g.y;
        }
        g.x = ox + (ev.clientX - sx) / sc;
        g.y = oy + (ev.clientY - sy) / sc;
        applyOne(el, g);
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

  /* ---------- resize + rotate + reset (on the box handles) ---------- */
  fbox.addEventListener("pointerdown", (e) => {
    const handle = e.target.closest("[data-h]");
    if (!handle) return;
    e.stopPropagation();
    const el = findEl();
    if (!el) return;
    const kind = handle.dataset.h;

    if (kind === "reset") {
      app.record();
      delete app.cur().overrides[selFkey];
      const k = selFkey;
      clear();
      app.refresh();
      // keep it selected after returning to flow
      const back = app.stage.querySelector(`[data-fkey="${k}"]`);
      if (back) selectEl(back);
      return;
    }

    const flow = el.dataset.fmode === "flow";
    if (flow && kind === "rot") return; // stacked cards don't rotate
    app.record("ff:" + kind + ":" + selFkey);
    const g = override(el, true);

    if (flow) {
      // resize within the flex stack: adjust basis (width) / min-height (height),
      // siblings reflow and conform — no overlap, never leaves the stack.
      g.flow = true;
      const [fhx, fhy] = kind.split(",").map(Number);
      const s0 = { w: g.w, h: g.h };
      const p0 = canvasPoint(e);
      flowStyle(el, g);
      return onDrag(
        (ev) => {
          const p = canvasPoint(ev);
          if (fhx) g.w = Math.max(MIN_W, s0.w + fhx * (p.x - p0.x));
          if (fhy) g.h = Math.max(MIN_H, s0.h + fhy * (p.y - p0.y));
          flowStyle(el, g);
          placeBox();
        },
        () => { app.commit(); app.renderNav(); app.broadcast(); }
      );
    }

    applyOne(el, g);

    if (kind === "rot") {
      const sc = app.scaleNow();
      const sr = app.stage.getBoundingClientRect();
      const ccx = sr.left + (g.x + g.w / 2) * sc;
      const ccy = sr.top + (g.y + g.h / 2) * sc;
      const a0 = Math.atan2(e.clientY - ccy, e.clientX - ccx);
      const r0 = g.rot || 0;
      onDrag(
        (ev) => {
          let deg = r0 + (Math.atan2(ev.clientY - ccy, ev.clientX - ccx) - a0) / DEG;
          if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
          g.rot = Math.round(deg);
          applyOne(el, g);
          placeBox();
        },
        () => {
          app.commit();
          app.renderNav();
          app.broadcast();
        }
      );
      return;
    }

    // resize: keep the opposite anchor fixed in world space (rotation-correct)
    const [hx, hy] = kind.split(",").map(Number);
    const a = (g.rot || 0) * DEG;
    const g0 = { ...g };
    const cx = g0.x + g0.w / 2, cy = g0.y + g0.h / 2;
    const off0 = rotate((-hx * g0.w) / 2, (-hy * g0.h) / 2, a);
    const anchor = { x: cx + off0.x, y: cy + off0.y };
    const p0 = canvasPoint(e);
    onDrag(
      (ev) => {
        const p = canvasPoint(ev);
        const dl = rotate(p.x - p0.x, p.y - p0.y, -a);
        let w = hx === 0 ? g0.w : Math.max(MIN_W, g0.w + hx * dl.x);
        let h = hy === 0 ? g0.h : Math.max(MIN_H, g0.h + hy * dl.y);
        const off = rotate((-hx * w) / 2, (-hy * h) / 2, a);
        g.w = w;
        g.h = h;
        g.x = anchor.x - off.x - w / 2;
        g.y = anchor.y - off.y - h / 2;
        applyOne(el, g);
        placeBox();
      },
      () => {
        app.commit();
        app.renderNav();
        app.broadcast();
      }
    );
  });

  // Esc clears selection (unless editing text, which Esc also exits via blur)
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && selFkey && !app.editing && !app.presenting) {
      clear();
    }
  });

  // After a full re-render: keep the overlay scale in sync and re-anchor selection.
  // (flayer lives in #stagebox, which renderSlide does not touch, so no re-attach.)
  app.freeform = {
    afterRender() {
      syncScale();
      if (selFkey) {
        const el = findEl();
        if (el) placeBox();
        else clear();
      }
    },
    clear,
  };
}
