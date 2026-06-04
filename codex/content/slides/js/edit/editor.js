// edit/editor.js — inline editing surface: double-click-to-edit text, the format
// toolbar, image pan/zoom, split divider, drop targets, and card/topic controls.
// All listeners are DELEGATED on the persistent #stage element and wired ONCE,
// so they survive every re-render (no per-render rewiring, no leaks).
import { setPath } from "../core/schema.js";
import { strategies } from "../select/geometry.js";

// Text formatting (A− A＋ B Cor) now lives in the context bar as descriptor
// primitives (see edit/textstyle.js + select/kinds.js) and acts on the selected
// editable; there is no floating #fmt toolbar. The editor still owns entering /
// leaving contenteditable and persisting the typed text content.

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

  // The image-slot selection bar's "trocar" reuses the editor's file picker.
  app.pickImage = (path) => pickImage(app, path);

  /* --- text editing --- */
  stage.addEventListener("dblclick", (e) => {
    const el = e.target.closest('[data-edit="1"]');
    if (!el) return;
    enterEdit(app, el);
  });
  stage.addEventListener("focusin", (e) => {
    const el = e.target.closest('[data-edit="1"]');
    if (!el) return;
    app.activeEditable = el; // the element the context-bar format controls act on
  });
  stage.addEventListener("focusout", (e) => {
    const el = e.target.closest('[data-edit="1"]');
    if (!el) return;
    exitEdit(app, el);
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
    // (card mode/move/delete + topic delete are now `card`/`topic` descriptor
    // controls; add card/topic is the `container` kind; reveal is the Animation
    // menu — all on the selection bar, not stage-delegated data-* handlers.)
    // (empty image slots are now selectable "image boxes": single-click selects via
    // the selection layer and the context bar offers "add image" — no auto-pick here)
    // replace a filled image
    if ((m = t.closest("[data-replace]"))) {
      e.stopPropagation();
      return pickImage(app, m.dataset.replace);
    }
    // (asset scope/mask/rotate/delete now live in the selection bar, js/select/)
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

  /* --- wheel: slot image zoom via the imageFraming strategy (framing != box) --- */
  stage.addEventListener(
    "wheel",
    (e) => {
      const im = e.target.closest(".slotimg");
      if (im) {
        e.preventDefault();
        const ref = im.dataset.img;
        app.record("zoom:" + ref);
        const f = strategies.imageFraming.read(app, ref);
        f.zoom = Math.min(4, Math.max(0.2, f.zoom + (e.deltaY < 0 ? 0.08 : -0.08)));
        strategies.imageFraming.write(app, ref, f);
        strategies.imageFraming.patch(im, f);
        app.commit();
        app.broadcast();
      }
    },
    { passive: false }
  );
}
