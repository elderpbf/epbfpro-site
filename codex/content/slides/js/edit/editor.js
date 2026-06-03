// edit/editor.js — inline editing surface: double-click-to-edit text, the format
// toolbar, image pan/zoom, split divider, drop targets, and card/topic controls.
// All listeners are DELEGATED on the persistent #stage element and wired ONCE,
// so they survive every re-render (no per-render rewiring, no leaks).
import { getByPath, setPath } from "../core/schema.js";
import { t } from "../../../../js/i18n.js";

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
    // logo show (un-hide); the logo's hide/variant/per-slide controls now live in
    // the unified selection bar (js/select/), not in an emitted .logoctl.
    if ((m = t.closest("[data-logoshow]"))) {
      e.stopPropagation();
      app.record();
      app.cur().hideLogo = false;
      return app.refresh();
    }
    // slot mask popover (no mutation here; opens the picker). Asset mask is a
    // selection-bar control now.
    if ((m = t.closest("[data-mask]"))) {
      e.stopPropagation();
      return app.openMask({ kind: "slot", path: m.dataset.mask }, m);
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
      app.cur().slots[m.dataset.add].push(t("slides.ed_new_topic"));
      app.step = app.maxStep();
      return app.refresh();
    }
    // cards
    if ((m = t.closest("[data-addcard]"))) {
      e.stopPropagation();
      app.record();
      app.cur().slots.cards.push({ mode: "text", text: t("slides.ed_new_card") });
      return app.refresh();
    }
    if ((m = t.closest("[data-carddel]"))) {
      e.stopPropagation();
      app.record();
      const cs = app.cur().slots.cards;
      cs.splice(+m.dataset.carddel, 1);
      if (!cs.length) cs.push({ mode: "text", text: t("slides.ed_card") });
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
    // (asset scope/mask/rotate/delete now live in the selection bar, js/select/)
  });

  /* --- delegated change (card mode, reveal, asset scope) --- */
  stage.addEventListener("change", (e) => {
    const t = e.target;
    let m;
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

  /* --- pointer drags: divider (logo + asset move now via the selection model) --- */
  stage.addEventListener("pointerdown", (e) => {
    if (app.presenting) return;

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
  });

  /* --- wheel: slot image zoom (logo + asset resize now via the selection frame) --- */
  stage.addEventListener(
    "wheel",
    (e) => {
      const im = e.target.closest(".slotimg");
      if (im) {
        e.preventDefault();
        app.record("zoom:" + im.dataset.img);
        const g = getByPath(app.cur().slots, im.dataset.img);
        g.zoom = Math.min(4, Math.max(0.2, (g.zoom || 1) + (e.deltaY < 0 ? 0.08 : -0.08)));
        im.style.transform = `translate(${g.tx || 0}px,${g.ty || 0}px) scale(${g.zoom})`;
        app.commit();
        app.broadcast();
      }
    },
    { passive: false }
  );
}

export { showFmt, hideFmt };
