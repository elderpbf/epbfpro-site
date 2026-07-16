// select/reorder.js  (SLIDES-EDITOR-INTERNAL, see selection.js scope lock)
//
// Drag-and-drop reorder for id-keyed list items (cards + topics) via ONE shared
// helper. Design constraints that shape it:
//   - It must not collide with the existing pointer gestures: a topic uses the
//     freeformSlot strategy (dragging its body lifts it to absolute), a card uses
//     the selection-frame resize. So ONLY a small grip is `draggable`, and the grip
//     stops nothing of the body's behaviour.
//   - Layouts emit content only (the LOG-009 contract). So the grip is an EDITOR
//     affordance injected here after each render — exactly like the selection frame
//     is a wiring overlay, never layout markup — not rendered by helpers.js.
//   - Drop position is the data-fkey INDEX within the item's own list, so it is
//     scale-agnostic (no canvas math) and the id-keyed override/style follow the
//     moved item for free (schema D1). The model mutation is the shared reorderItem.
import { reorderItem } from "./kinds.js";
import { t } from "../../../../js/i18n.js";

const GRIP_GLYPH = "⠿"; // ⠿ braille dots: the conventional drag-handle mark

export function initReorder(app) {
  const stage = app.stage;
  let dragRef = null;

  // Inject a grip per reorderable item AFTER render. The stage innerHTML is replaced
  // on every renderSlide, so grips are re-created each time; thumbnails/presenter
  // render through the same helpers but never call this, so they stay grip-free.
  function afterRender() {
    if (app.presenting) return;
    stage.querySelectorAll(".card[data-fkey], .topiclist li[data-fkey]").forEach((item) => {
      if (item.querySelector(":scope > .reorder-grip")) return;
      const g = document.createElement("span");
      g.className = "reorder-grip editoronly";
      g.draggable = true;
      g.title = t("slides.ed_reorder");
      g.textContent = GRIP_GLYPH;
      item.appendChild(g);
    });
  }

  // A valid drop target is a sibling item of the SAME kind/list as the dragged one,
  // never itself. fromRef's list prefix selects cards vs topics so a card image slot
  // (also data-fkey, prefixed "cards.") can never masquerade as a drop target.
  function dropTarget(node, fromRef) {
    const list = fromRef.split(".")[0];
    const sel = list === "topics" ? ".topiclist li[data-fkey]" : ".card[data-fkey]";
    const item = node.closest && node.closest(sel);
    if (!item || item.dataset.fkey === fromRef) return null;
    if (item.dataset.fkey.split(".")[0] !== list) return null;
    return item;
  }

  function clearMarks() {
    stage.querySelectorAll(".dragover").forEach((n) => n.classList.remove("dragover"));
    stage.querySelectorAll(".dragging").forEach((n) => n.classList.remove("dragging"));
  }
  function end() { clearMarks(); dragRef = null; }

  stage.addEventListener("dragstart", (e) => {
    const grip = e.target.closest && e.target.closest(".reorder-grip");
    if (!grip) return;
    const item = grip.closest("[data-fkey]");
    dragRef = item ? item.dataset.fkey : null;
    if (!dragRef) return;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dragRef); // Firefox won't start a drag without a payload
    item.classList.add("dragging");
  });

  stage.addEventListener("dragover", (e) => {
    if (!dragRef) return;
    const over = dropTarget(e.target, dragRef);
    if (!over) return;
    e.preventDefault(); // allow the drop
    e.dataTransfer.dropEffect = "move";
    if (!over.classList.contains("dragover")) {
      stage.querySelectorAll(".dragover").forEach((n) => n.classList.remove("dragover"));
      over.classList.add("dragover");
    }
  });

  stage.addEventListener("drop", (e) => {
    if (!dragRef) return;
    const over = dropTarget(e.target, dragRef);
    e.preventDefault();
    if (over) reorderItem(app, dragRef, over.dataset.fkey); // refreshes -> afterRender re-injects grips
    end();
  });

  stage.addEventListener("dragend", end);

  // `gripReorder`, NOT `reorder`: the controller ALREADY owns reorder(from, to), the
  // deck op that moves a SLIDE (app.js), which the navigator's arrows and thumb-drag
  // both call. Publishing this subsystem as app.reorder overwrote that method with an
  // object, and both died silently (Élder 2026-07-16: "não consigo reordenar slides;
  // nem as setas nem arrastar"). A subsystem handle never squats on a controller verb.
  app.gripReorder = { afterRender };
}
