// js/pointer-reorder.js
// Pointer-drag reordering for a list whose markup the CONSUMER owns.
//
// js/list-rail.js already does this for the rails it renders, but it can only do it for its
// own .cdx-rail-* markup. Lessons cannot move onto that markup: its sidebar look IS the
// product and is frozen ("a aparencia dele e unica e nao pode mudar" - Elder 2026-07-17), so
// it renders its own cards and needs drag anyway. Without this module that is a second
// hand-rolled drag, which is the exact duplication track-41 exists to undo.
//
// The rail's own drag should come here too, but NOT blind: today it is guarded by
// source-regex tests only (tests/list-rail.test.mjs asserts the string 'pointerdown' appears),
// so swapping its engine would be an unverified change to 10 live screens. That extraction is
// a task with a prerequisite (behavioural coverage first), recorded in tasks/track-41.md.
//
// Two deliberate differences from the rail's drag, both forced by "the consumer owns the
// markup":
//
//   NO GRIP. A grip is a visible affordance and Lessons' appearance is frozen, so there is
//   nowhere to put one. A press only becomes a drag past `threshold` px; under it the click
//   still reaches the consumer's own handler and selects/toggles exactly as before.
//
//   NO touch-action:none. The rail can pin it on its grip because a grip is a few px wide.
//   Here the handle IS the card (or the section head), and touch-action:none on those would
//   kill scrolling of the very list being dragged. So on touch the browser wins: the scroll
//   fires pointercancel and the drag drops. Drag is mouse/pen; touch scrolls. That is the
//   right trade for a teaching desktop, and it fails soft (no drag) rather than wrong (no
//   scroll).
//
//   const h = mountReorder(containerEl, {
//     itemSel, handleSel, listSel, idAttr, threshold, dragClass, canDrag, onReorder,
//   });
//   h.destroy();

const DEFAULT_THRESHOLD = 4; // px before a press becomes a drag (lets a tap still click)

export function mountReorder(container, cfg) {
  cfg = cfg || {};
  const itemSel = cfg.itemSel;
  const handleSel = cfg.handleSel || itemSel;
  const listSel = cfg.listSel || null;
  const idAttr = cfg.idAttr || 'data-id';
  const threshold = cfg.threshold == null ? DEFAULT_THRESHOLD : cfg.threshold;
  const dragClass = cfg.dragClass || 'is-dragging';

  let drag = null;
  let swallowClick = false;

  // The list an item may move WITHIN. listSel scopes the whole thing: Lessons mounts one
  // instance per draggable list over the SAME container, and this is what stops the favourites
  // instance from grabbing a card in the Items section (its closest() finds no favourites body,
  // so the drag never starts).
  function listOf(el) {
    if (!el) return null;
    return listSel ? el.closest(listSel) : el.parentNode;
  }

  function idsIn(list) {
    return Array.from(list.children)
      .filter((el) => el.matches && el.matches(itemSel))
      .map((el) => el.getAttribute(idAttr));
  }

  function onDown(e) {
    if (e.button != null && e.button !== 0) return;  // right-click belongs to the context menu
    if (!e.target || !e.target.closest) return;
    const handle = e.target.closest(handleSel);
    if (!handle) return;
    const item = handle.closest(itemSel);
    if (!item || !container.contains(item)) return;
    const list = listOf(item);
    if (!list || !container.contains(list)) return;
    if (cfg.canDrag && !cfg.canDrag(item)) return;
    drag = { item, list, handle, startY: e.clientY, moved: false, pointerId: e.pointerId };
    try { handle.setPointerCapture(e.pointerId); } catch (_) { /* older browsers */ }
  }

  function onMove(e) {
    if (!drag) return;
    if (!drag.moved) {
      if (Math.abs(e.clientY - drag.startY) < threshold) return;
      drag.moved = true;
      drag.item.classList.add(dragClass);
    }
    e.preventDefault();
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const over = under && under.closest ? under.closest(itemSel) : null;
    // Reorder WITHIN the item's own list only. A cross-list move needs a destination contract
    // (the rail's onMoveItem) and neither Lessons list has one: favourites is one bucket, and
    // the sections are the body's only children.
    if (!over || over === drag.item || listOf(over) !== drag.list) return;
    const r = over.getBoundingClientRect();
    const after = (e.clientY - r.top) > r.height / 2;
    drag.list.insertBefore(drag.item, after ? over.nextSibling : over);
  }

  function onUp() {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.handle) { try { d.handle.releasePointerCapture(d.pointerId); } catch (_) { /* ignore */ } }
    d.item.classList.remove(dragClass);
    if (!d.moved) return;  // a press without movement is a click, not a reorder
    // A real drag still ends in a click on the handle. Left alone that fires the consumer's own
    // action, so dropping a Lessons section would collapse the very section just moved. Swallow
    // exactly one click, and clear the flag on the next task in case the drop re-rendered the
    // handle out of the document and no click ever comes (a stuck flag would eat an unrelated
    // click later, which is worse than the bug it guards).
    swallowClick = true;
    setTimeout(() => { swallowClick = false; }, 0);
    if (cfg.onReorder) cfg.onReorder(idsIn(d.list));
  }

  function onClickCapture(e) {
    if (!swallowClick) return;
    swallowClick = false;
    e.stopPropagation();
    e.preventDefault();
  }

  container.addEventListener('pointerdown', onDown);
  container.addEventListener('pointermove', onMove);
  container.addEventListener('pointerup', onUp);
  container.addEventListener('pointercancel', onUp);
  container.addEventListener('click', onClickCapture, true);

  return {
    destroy() {
      container.removeEventListener('pointerdown', onDown);
      container.removeEventListener('pointermove', onMove);
      container.removeEventListener('pointerup', onUp);
      container.removeEventListener('pointercancel', onUp);
      container.removeEventListener('click', onClickCapture, true);
      drag = null;
      swallowClick = false;
    },
  };
}
