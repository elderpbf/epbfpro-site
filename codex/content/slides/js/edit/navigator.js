// edit/navigator.js — slide thumbnail strip: select, reorder (buttons + drag),
// add/duplicate/remove are deck ops on the app controller.
import { renderInto } from "../render/player.js";
import { t } from "../../../../js/i18n.js";
import { glyphSvg } from "../../../../js/glyphs.js";

export function createNavigator(app) {
  const nav = app.nav;

  function render() {
    const deck = app.deck();
    nav.innerHTML = "";

    // Pinned header at the top of the rail: slide navigator (◀ pos / total ▶) +
    // "＋ slide", sticky so it stays visible while the thumbnails scroll below.
    // prev/next are the editor's slide nav (moved out of the chrome); keyboard
    // arrows still drive app.go independently. stopPropagation on "＋ slide" so the
    // doc-click dismissal doesn't immediately close the menu it just opened.
    const hdr = document.createElement("div");
    hdr.className = "navhdr";
    const atFirst = app.index <= 0;
    const atLast = app.index >= deck.slides.length - 1;
    hdr.innerHTML =
      `<div class="navnav">` +
        `<button class="navbtn" data-prev ${atFirst ? "disabled" : ""}>◀</button>` +
        `<span class="pos">${app.index + 1} / ${deck.slides.length}</span>` +
        `<button class="navbtn" data-next ${atLast ? "disabled" : ""}>▶</button>` +
      `</div>` +
      `<button class="navadd" data-add>＋ ${t("slides.ed_slide")}</button>`;
    nav.appendChild(hdr);
    hdr.querySelector("[data-prev]").onclick = (e) => { e.stopPropagation(); app.go(-1); };
    hdr.querySelector("[data-next]").onclick = (e) => { e.stopPropagation(); app.go(1); };
    hdr.querySelector("[data-add]").onclick = (e) => { e.stopPropagation(); app.openAddSlide(); };

    // `th`, NOT `t`: this file imports the translator as `t`, and a local `const t`
    // shadows it for the whole closure. The ⚠ badge below calls t() INSIDE this
    // scope, so naming the thumb `t` turned every reflow-flagged slide into a
    // "t is not a function" TypeError that killed the entire rail render.
    deck.slides.forEach((s, i) => {
      const th = document.createElement("div");
      th.className = "thumb" + (i === app.index ? " active" : "");
      th.draggable = true;
      th.dataset.i = i;
      th.innerHTML =
        `<div class="num">${i + 1}</div>` +
        // A shared slide is marked on the rail because its blast radius is not local:
        // editing it here edits it in every deck that links it. A broken ref (the
        // library entry is gone) says so in the tooltip instead of pretending to be fine.
        (s.ref ? `<div class="lnkbadge${s._broken ? " broken" : ""}" title="${t(s._broken ? "slides.shr_broken_tip" : "slides.shr_badge_tip")}">${glyphSvg("link", { size: 11 })}</div>` : "") +
        (s.reflowWarn ? `<div class="revbadge" title="${t("slides.ed_reflow_warn")}">⚠</div>` : "") +
        `<div class="tctl"><button data-up="${i}">↑</button><button data-down="${i}">↓</button><button data-rm="${i}">✕</button></div>` +
        `<div class="mini"><div class="scale"></div></div>`;
      renderInto(th.querySelector(".scale"), deck, s);
      const mini = th.querySelector(".mini");
      requestAnimationFrame(() => {
        const sc = th.querySelector(".scale");
        if (sc) sc.style.transform = `scale(${mini.clientWidth / deck.canvas.w})`;
      });
      if (app.isMultiPicked(i)) th.classList.add("picked");
      th.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        // Shift = pick a RANGE from the current slide to this one; Ctrl/Cmd = toggle this
        // one. The range anchor is app.index (the slide on the stage), so shift-clicking
        // never moves the stage: the whole point is picking slides to copy while still
        // looking at one of them. A plain click clears the pick and navigates, so the
        // multi-selection can never survive invisibly into the next gesture.
        if (e.shiftKey) { e.preventDefault(); app.pickRange(i); return; }
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); app.pickToggle(i); return; }
        app.clearPick();
        app.goTo(i);
      });
      nav.appendChild(th);
    });

    nav.querySelectorAll("[data-up]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); app.move(+b.dataset.up, -1); }));
    nav.querySelectorAll("[data-down]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); app.move(+b.dataset.down, 1); }));
    nav.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); app.removeSlide(+b.dataset.rm); }));

    let dragI = null;
    nav.querySelectorAll(".thumb").forEach((th) => {
      th.addEventListener("dragstart", () => (dragI = +th.dataset.i));
      th.addEventListener("dragover", (e) => { e.preventDefault(); th.classList.add("dragover"); });
      th.addEventListener("dragleave", () => th.classList.remove("dragover"));
      th.addEventListener("drop", (e) => { e.preventDefault(); th.classList.remove("dragover"); app.reorder(dragI, +th.dataset.i); });
    });
  }

  return { render };
}
