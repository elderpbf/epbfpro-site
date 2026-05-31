// edit/editor.js — inline editing surface: double-click-to-edit text, the format
// toolbar, image pan/zoom, split divider, drop targets, and card/topic controls.
// All listeners are DELEGATED on the persistent #stage element and wired ONCE,
// so they survive every re-render (no per-render rewiring, no leaks).
import { getByPath, setPath } from "../core/schema.js";

/* ---------- format toolbar (the v7 vanish-on-release bug lived here) ---------- */
// Old model hid the toolbar from a document-level "click outside" heuristic, which
// fired on mouse-up and killed it. New model: show on focusin of an editable, hide
// on focusout UNLESS focus moved into the toolbar (checked via relatedTarget).

function showFmt(app, el) {
  const fmt = app.fmt;
  fmt.style.display = "flex";
  const r = el.getBoundingClientRect();
  const fw = fmt.offsetWidth || 240;
  let left = r.left + r.width / 2 - fw / 2;
  left = Math.max(8, Math.min(window.innerWidth - fw - 8, left));
  let top = r.top - fmt.offsetHeight - 10;
  if (top < 56) top = r.bottom + 10; // not enough room above → drop below
  fmt.style.left = left + "px";
  fmt.style.top = top + "px";
}
function hideFmt(app) {
  app.fmt.style.display = "none";
}

function enterEdit(app, el) {
  el.setAttribute("contenteditable", "true");
  el.focus();
  // place caret at click point / end
  const sel = window.getSelection();
  if (sel && el.firstChild) {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  app.editing = true;
}

function exitEdit(app, el) {
  el.removeAttribute("contenteditable");
  app.editing = false;
}

/* ---------- generic drag helper ---------- */
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

function pickImage(app, path) {
  const inp = document.createElement("input");
  inp.type = "file";
  inp.accept = "image/*";
  inp.onchange = () => {
    const f = inp.files[0];
    if (!f) return;
    app.record();
    setPath(app.cur().slots, path, { src: URL.createObjectURL(f), tx: 0, ty: 0, zoom: 1 });
    app.renderSlide();
    app.renderNav();
    app.commit();
    app.broadcast();
  };
  inp.click();
}

export function initEditing(app) {
  if (app.isPresenter) return;
  const stage = app.stage;

  /* --- text editing --- */
  stage.addEventListener("dblclick", (e) => {
    const el = e.target.closest('[data-edit="1"]');
    if (!el) return;
    enterEdit(app, el);
  });
  stage.addEventListener("focusin", (e) => {
    const el = e.target.closest('[data-edit="1"]');
    if (!el) return;
    app.activeEditable = el;
    showFmt(app, el);
  });
  stage.addEventListener("focusout", (e) => {
    const el = e.target.closest('[data-edit="1"]');
    if (!el) return;
    if (e.relatedTarget && app.fmt.contains(e.relatedTarget)) return; // into the toolbar → keep
    exitEdit(app, el);
    hideFmt(app);
    app.renderNav();
  });
  stage.addEventListener("input", (e) => {
    const el = e.target.closest('[data-edit="1"][contenteditable="true"]');
    if (!el) return;
    if (el.dataset.aid) {
      app.record("edit:" + el.dataset.aid); // coalesces a typing burst into one undo
      const a = app.deck().assets.find((x) => x.id === el.dataset.aid);
      if (a) a.text = el.innerHTML;
    } else if (el.dataset.path) {
      app.record("edit:" + el.dataset.path);
      setPath(app.cur().slots, el.dataset.path, el.innerHTML);
    } else return;
    app.commit();
    app.broadcast();
  });

  /* --- delegated control clicks --- */
  stage.addEventListener("click", (e) => {
    const t = e.target;
    let m;
    // logo hide / show (per slide)
    if ((m = t.closest("[data-logohide]"))) {
      e.stopPropagation();
      app.record();
      app.cur().hideLogo = true;
      return app.refresh();
    }
    if ((m = t.closest("[data-logoshow]"))) {
      e.stopPropagation();
      app.record();
      app.cur().hideLogo = false;
      return app.refresh();
    }
    // mask popovers (no mutation here; opens the picker)
    if ((m = t.closest("[data-mask]"))) {
      e.stopPropagation();
      return app.openMask({ kind: "slot", path: m.dataset.mask }, m);
    }
    if ((m = t.closest("[data-asmask]"))) {
      e.stopPropagation();
      return app.openMask({ kind: "asset", id: m.dataset.asmask }, m);
    }
    // remove a topic
    if ((m = t.closest("[data-del]"))) {
      e.stopPropagation();
      app.record();
      const [arr, i] = m.dataset.del.split(".");
      app.cur().slots[arr].splice(+i, 1);
      app.step = Math.min(app.step, app.maxStep());
      return app.refresh();
    }
    // add a topic
    if ((m = t.closest("[data-add]"))) {
      e.stopPropagation();
      app.record();
      app.cur().slots[m.dataset.add].push("Novo tópico");
      app.step = app.maxStep();
      return app.refresh();
    }
    // cards
    if ((m = t.closest("[data-addcard]"))) {
      e.stopPropagation();
      app.record();
      app.cur().slots.cards.push({ mode: "text", text: "Novo card" });
      return app.refresh();
    }
    if ((m = t.closest("[data-carddel]"))) {
      e.stopPropagation();
      app.record();
      const cs = app.cur().slots.cards;
      cs.splice(+m.dataset.carddel, 1);
      if (!cs.length) cs.push({ mode: "text", text: "Card" });
      app.step = Math.min(app.step, app.maxStep());
      return app.refresh();
    }
    if ((m = t.closest("[data-cardmove]"))) {
      e.stopPropagation();
      const [i, d] = m.dataset.cardmove.split(":").map(Number);
      const cs = app.cur().slots.cards;
      const j = i + d;
      if (j < 0 || j >= cs.length) return;
      app.record();
      [cs[i], cs[j]] = [cs[j], cs[i]];
      return app.refresh();
    }
    // empty image slot → pick
    const slot = t.closest(".dropzone:not(.filled)");
    if (slot && !t.closest("button")) {
      e.stopPropagation();
      return pickImage(app, slot.dataset.img);
    }
    // replace a filled image
    if ((m = t.closest("[data-replace]"))) {
      e.stopPropagation();
      return pickImage(app, m.dataset.replace);
    }
    // assets
    if ((m = t.closest("[data-asdel]"))) {
      e.stopPropagation();
      app.record();
      app.deck().assets = app.deck().assets.filter((x) => x.id !== m.dataset.asdel);
      return app.refresh();
    }
    if ((m = t.closest("[data-asrot]"))) {
      e.stopPropagation();
      app.record("asrot:" + m.dataset.asrot.split(":")[0]);
      const [id, d] = m.dataset.asrot.split(":");
      const a = app.deck().assets.find((x) => x.id === id);
      a.rot = ((a.rot || 0) + Number(d)) % 360;
      return app.refresh();
    }
  });

  /* --- delegated change (card mode, reveal, asset scope) --- */
  stage.addEventListener("change", (e) => {
    const t = e.target;
    let m;
    if ((m = t.closest("[data-logovar]"))) {
      app.record();
      app.cur().logoVariant = t.value;
      return app.refresh();
    }
    if ((m = t.closest("[data-cardmode]"))) {
      app.record();
      app.cur().slots.cards[+m.dataset.cardmode].mode = t.value;
      return app.refresh();
    }
    if ((m = t.closest("[data-cardreveal]"))) {
      app.record();
      app.cur().slots.reveal = t.checked;
      app.step = 0;
      return app.refresh();
    }
    if ((m = t.closest("[data-ascope]"))) {
      app.record();
      const a = app.deck().assets.find((x) => x.id === m.dataset.ascope);
      a.scope = t.value;
      if (t.value === "slide") a.slideId = app.cur().id;
      if (t.value === "layout") a.layout = app.cur().layout;
      return app.refresh();
    }
  });

  /* --- image drop targets --- */
  stage.addEventListener("dragover", (e) => e.preventDefault());
  stage.addEventListener("drop", (e) => {
    const zone = e.target.closest(".dropzone");
    const f = e.dataTransfer.files[0];
    if (!f || !f.type.startsWith("image")) return;
    e.preventDefault();
    e.stopPropagation();
    app.record();
    if (zone) {
      setPath(app.cur().slots, zone.dataset.img, { src: URL.createObjectURL(f), tx: 0, ty: 0, zoom: 1 });
    } else {
      // dropped on empty slide area → placeable free asset at the drop point
      const r = stage.getBoundingClientRect();
      const sc = app.scaleNow();
      app.deck().assets.push({
        id: Math.random().toString(36).slice(2, 9),
        src: URL.createObjectURL(f),
        x: (e.clientX - r.left) / sc - 90,
        y: (e.clientY - r.top) / sc - 90,
        w: 180,
        rot: 0,
        scope: "slide",
        slideId: app.cur().id,
      });
    }
    app.refresh();
  });

  /* --- pointer drags: logo, divider, asset move (slot images move via freeform now) --- */
  stage.addEventListener("pointerdown", (e) => {
    if (app.presenting) return;
    const sc = app.scaleNow();

    // logo: deck-level drag (repositions the logo on every slide)
    const lg = e.target.closest(".logo[data-logo]");
    if (lg && !e.target.closest(".logoctl")) {
      app.record("logo");
      const L = (app.deck().logo = app.deck().logo || { x: 40, y: 30, h: 40 });
      const sx = e.clientX, sy = e.clientY, ox = L.x, oy = L.y;
      lg.classList.add("dragging");
      return onDrag(
        (ev) => { L.x = ox + (ev.clientX - sx) / sc; L.y = oy + (ev.clientY - sy) / sc; lg.style.left = L.x + "px"; lg.style.top = L.y + "px"; },
        () => { lg.classList.remove("dragging"); app.renderNav(); app.commit(); app.broadcast(); }
      );
    }

    const dv = e.target.closest(".divider");
    if (dv) {
      app.record("divider");
      const r = stage.getBoundingClientRect();
      return onDrag(
        (ev) => {
          const ratio = Math.min(0.8, Math.max(0.2, (ev.clientX - r.left) / r.width));
          app.cur().slots.ratio = ratio;
          const c = stage.querySelector(".L-split");
          if (c) c.style.gridTemplateColumns = `${ratio * 100}% ${(1 - ratio) * 100}%`;
          dv.style.left = ratio * 100 + "%";
        },
        () => {
          app.renderNav();
          app.commit();
          app.broadcast();
        }
      );
    }

    const as = e.target.closest(".asset");
    if (as && !e.target.closest(".assetctl") && !e.target.closest('[contenteditable="true"]')) {
      app.record("amove:" + as.dataset.asset);
      const a = app.deck().assets.find((x) => x.id === as.dataset.asset);
      const sx = e.clientX,
        sy = e.clientY,
        ox = a.x,
        oy = a.y;
      as.classList.add("dragging");
      return onDrag(
        (ev) => {
          a.x = ox + (ev.clientX - sx) / sc;
          a.y = oy + (ev.clientY - sy) / sc;
          as.style.left = a.x + "px";
          as.style.top = a.y + "px";
        },
        () => {
          as.classList.remove("dragging");
          app.renderNav();
          app.commit();
          app.broadcast();
        }
      );
    }
  });

  /* --- wheel: image zoom, asset resize --- */
  stage.addEventListener(
    "wheel",
    (e) => {
      const lg = e.target.closest(".logo[data-logo]");
      if (lg) {
        e.preventDefault();
        app.record("logosize");
        const L = (app.deck().logo = app.deck().logo || { x: 40, y: 30, h: 40 });
        L.h = Math.max(16, Math.min(160, (L.h || 40) + (e.deltaY < 0 ? 3 : -3)));
        lg.style.height = L.h + "px";
        app.renderNav();
        app.commit();
        app.broadcast();
        return;
      }
      const im = e.target.closest(".slotimg");
      if (im) {
        e.preventDefault();
        app.record("zoom:" + im.dataset.img);
        const g = getByPath(app.cur().slots, im.dataset.img);
        g.zoom = Math.min(4, Math.max(0.2, (g.zoom || 1) + (e.deltaY < 0 ? 0.08 : -0.08)));
        im.style.transform = `translate(${g.tx || 0}px,${g.ty || 0}px) scale(${g.zoom})`;
        app.commit();
        app.broadcast();
        return;
      }
      const as = e.target.closest(".asset");
      if (as) {
        e.preventDefault();
        app.record("aresize:" + as.dataset.asset);
        const a = app.deck().assets.find((x) => x.id === as.dataset.asset);
        a.w = Math.max(40, Math.min(900, a.w + (e.deltaY < 0 ? 14 : -14)));
        as.style.width = a.w + "px";
        app.renderNav();
        app.commit();
        app.broadcast();
      }
    },
    { passive: false }
  );
}

export { showFmt, hideFmt };
