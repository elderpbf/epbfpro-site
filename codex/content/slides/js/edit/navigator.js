// edit/navigator.js — slide thumbnail strip: select, reorder (buttons + drag),
// add/duplicate/remove are deck ops on the app controller.
import { renderInto } from "../render/player.js";

export function createNavigator(app) {
  const nav = app.nav;

  function render() {
    const deck = app.deck();
    nav.innerHTML = "";
    deck.slides.forEach((s, i) => {
      const t = document.createElement("div");
      t.className = "thumb" + (i === app.index ? " active" : "");
      t.draggable = true;
      t.dataset.i = i;
      t.innerHTML =
        `<div class="num">${i + 1}</div>` +
        `<div class="tctl"><button data-up="${i}">↑</button><button data-down="${i}">↓</button><button data-rm="${i}">✕</button></div>` +
        `<div class="mini"><div class="scale"></div></div>`;
      renderInto(t.querySelector(".scale"), deck, s);
      const mini = t.querySelector(".mini");
      requestAnimationFrame(() => {
        const sc = t.querySelector(".scale");
        if (sc) sc.style.transform = `scale(${mini.clientWidth / deck.canvas.w})`;
      });
      t.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        app.goTo(i);
      });
      nav.appendChild(t);
    });

    // "＋ slide" lives at the bottom of the rail (PowerPoint/Slides-style); it opens
    // the layout picker into the context bar. stopPropagation so the doc-click
    // dismissal doesn't immediately close the menu it just opened.
    const add = document.createElement("button");
    add.className = "navadd";
    add.textContent = "＋ slide";
    add.addEventListener("click", (e) => { e.stopPropagation(); app.openAddSlide(); });
    nav.appendChild(add);

    nav.querySelectorAll("[data-up]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); app.move(+b.dataset.up, -1); }));
    nav.querySelectorAll("[data-down]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); app.move(+b.dataset.down, 1); }));
    nav.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); app.removeSlide(+b.dataset.rm); }));

    let dragI = null;
    nav.querySelectorAll(".thumb").forEach((t) => {
      t.addEventListener("dragstart", () => (dragI = +t.dataset.i));
      t.addEventListener("dragover", (e) => { e.preventDefault(); t.classList.add("dragover"); });
      t.addEventListener("dragleave", () => t.classList.remove("dragover"));
      t.addEventListener("drop", (e) => { e.preventDefault(); t.classList.remove("dragover"); app.reorder(dragI, +t.dataset.i); });
    });
  }

  return { render };
}
