// js/reorder.js
// The ONE shared drag-to-reorder helper for id-keyed list rows. Codex had this native
// HTML5-drag boilerplate copy-pasted per tab (questions/bank, content/tarefas, cohorts
// aula-hub, slides' own sealed copy), each reimplementing dragstart/dragover/drop +
// array-splice + api.reorderX. This centralizes it: wire a container once and, on drop,
// it calls onReorder(orderedIds) with the new order. Rows carry a stable id (data-id by
// default) and must be draggable="true".
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
export function makeReorderable(container, opts) {
  opts = opts || {};
  const itemSelector = opts.itemSelector || '[data-id]';
  const getId = opts.getId || ((el) => el.getAttribute('data-id'));
  const onReorder = opts.onReorder || function () {};
  const dragClass = opts.dragClass || 'is-dragging';

  let dragEl = null;

  function currentRows() {
    return Array.from(container.querySelectorAll(':scope > ' + itemSelector));
  }
  function rowFrom(target) {
    const row = target && target.closest ? target.closest(itemSelector) : null;
    return row && row.parentNode === container ? row : null;
  }

  function onDragStart(e) {
    const row = rowFrom(e.target);
    if (!row) return;
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
    const row = rowFrom(e.target);
    if (!row || row === dragEl) return;
    const rect = row.getBoundingClientRect();
    const after = (e.clientY - rect.top) > rect.height / 2;
    container.insertBefore(dragEl, after ? row.nextSibling : row);
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
