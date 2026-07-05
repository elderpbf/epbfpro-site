// js/reorder.js
// The ONE shared drag-to-reorder helper for id-keyed list rows. Codex had this native
// HTML5-drag boilerplate copy-pasted per tab (questions/bank, questions/live-host,
// cohorts aula-hub, content/tarefas, slides' own sealed copy), each reimplementing
// dragstart/dragover/drop + array-splice + api.reorderX. This centralizes it: wire a
// container once and, on drop, it calls onReorder(orderedIds) with the new order. Rows
// carry a stable id (data-id by default) and must be draggable="true".
//
//   const destroy = makeReorderable(listEl, {
//     itemSelector: '.cdx-item-row',
//     getId: (el) => el.dataset.id,
//     onReorder: (ids) => api.reorderX({ ordered_ids: ids.map(Number) }),
//   });
//
// Listeners live on the CONTAINER (delegation), so re-rendering rows via innerHTML keeps
// them working; call the returned destroy() on unmount. Native DnD is desktop-first (no
// touch); that matches the Codex admin surface.
//
// Two opt-in capabilities cover the shapes the per-tab copies had (and the future
// list-rail module needs), so callers never have to fork the drag logic again:
//   • opts.listSelector — when the rows are NOT direct children of the wired element but
//     sit inside an inner list that gets re-rendered (a header/filters/list layout, e.g.
//     bank's #cdx-bank-body > .cdx-bank-qlist), wire the STABLE outer container and pass
//     the inner list's selector. Rows are read/moved within that inner element, resolved
//     live so it survives innerHTML re-renders. Defaults to the container itself.
//   • opts.canDrag(row) — a predicate gating whether a drag may START (mode-gated lists:
//     bank's _editBank, live-host's _bankReorder, aula-hub's no-unsaved-row rule).
export function makeReorderable(container, opts) {
  opts = opts || {};
  const itemSelector = opts.itemSelector || '[data-id]';
  const getId = opts.getId || ((el) => el.getAttribute('data-id'));
  const onReorder = opts.onReorder || function () {};
  const dragClass = opts.dragClass || 'is-dragging';
  const canDrag = typeof opts.canDrag === 'function' ? opts.canDrag : null;

  let dragEl = null;

  // The element that DIRECTLY holds the rows (may be re-rendered under `container`).
  function listEl() {
    return opts.listSelector ? container.querySelector(opts.listSelector) : container;
  }
  function currentRows() {
    const list = listEl();
    return list ? Array.from(list.querySelectorAll(':scope > ' + itemSelector)) : [];
  }
  function rowFrom(target) {
    const list = listEl();
    const row = target && target.closest ? target.closest(itemSelector) : null;
    return row && list && row.parentNode === list ? row : null;
  }

  function onDragStart(e) {
    const row = rowFrom(e.target);
    if (!row) return;
    if (canDrag && !canDrag(row)) { e.preventDefault(); return; }
    dragEl = row;
    row.classList.add(dragClass);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', String(getId(row))); } catch (_) { /* IE guard */ }
    }
  }
  function onDragOver(e) {
    if (!dragEl) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    const row = rowFrom(e.target);
    if (!row || row === dragEl) return;
    const rect = row.getBoundingClientRect();
    const after = (e.clientY - rect.top) > rect.height / 2;
    const list = listEl();
    if (list) list.insertBefore(dragEl, after ? row.nextSibling : row);
  }
  function finish(e) {
    if (e) e.preventDefault();
    if (!dragEl) return;
    dragEl.classList.remove(dragClass);
    dragEl = null;
    onReorder(currentRows().map(getId));
  }

  container.addEventListener('dragstart', onDragStart);
  container.addEventListener('dragover', onDragOver);
  container.addEventListener('drop', finish);
  container.addEventListener('dragend', finish);

  return function destroy() {
    container.removeEventListener('dragstart', onDragStart);
    container.removeEventListener('dragover', onDragOver);
    container.removeEventListener('drop', finish);
    container.removeEventListener('dragend', finish);
    dragEl = null;
  };
}
