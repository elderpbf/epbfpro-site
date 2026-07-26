// js/list-sync.js
// The ONE shared answer to "list scrolls back to top after an edit/delete/bulk
// action" (track-26 item 2.b). Two layers, pick by what the mutation payload
// gives you:
//
//   Layer 1 -- renderPreservingScroll(scrollEl, renderFn): wrap ANY post-mutation
//   refresh, no matter how the data gets there (full refetch, in-memory patch,
//   whatever). It only guards the scroll position, so it applies uniformly
//   everywhere a list re-renders after a user action, including a refetch that
//   shows a transient "loading..." placeholder (which collapses the container's
//   height and would otherwise clamp scrollTop to 0 mid-flight).
//
//     await renderPreservingScroll(bodyEl, async () => {
//       await _loadQuestions();   // whatever already re-renders the list
//     });
//
//   Layer 2 -- replaceById/removeById/upsertById: pure array helpers for when
//   the mutation already hands you the full updated row (a single edit/delete
//   with no server-side join), so you can skip the refetch entirely and patch
//   the in-memory array before re-rendering. Do NOT reach for these when the
//   rendered rows depend on data the mutation response doesn't carry (a
//   multi-source join, a bulk action with no per-row result) -- synthesizing
//   that state client-side is a correctness risk, not a convenience; keep
//   Layer 1 there instead.
//
// patchCard is a DOM-level counterpart to Layer 2: swap one row's markup
// in place (by a data-id-ish selector) instead of re-rendering the whole list,
// for callers that already build single-card HTML and want to avoid touching
// sibling rows' DOM nodes (event listeners delegated on a parent survive this;
// listeners bound directly to the row do not).

// Layer 1: capture scrollEl's scroll position, run renderFn (sync or async),
// restore the position. Safe even if renderFn replaces scrollEl's innerHTML
// with a transient loading state along the way, since restore happens after
// renderFn settles, not before.
export async function renderPreservingScroll(scrollEl, renderFn) {
  const keep = scrollEl ? scrollEl.scrollTop : 0;
  await renderFn();
  if (scrollEl) scrollEl.scrollTop = keep;
}

// Layer 2, pure: return a new array with the item matching id replaced by
// `item` (merged over the existing entry so callers can pass a partial patch).
// No match -> the array is returned unchanged (new reference, same contents).
export function replaceById(arr, id, item) {
  const list = Array.isArray(arr) ? arr : [];
  const key = String(id);
  return list.map((row) => (row && String(row.id) === key) ? Object.assign({}, row, item) : row);
}

// Layer 2, pure: return a new array with the item matching id removed.
export function removeById(arr, id) {
  const list = Array.isArray(arr) ? arr : [];
  const key = String(id);
  return list.filter((row) => !(row && String(row.id) === key));
}

// Layer 2, pure: replace the item matching id, or append `item` if no row
// matches (covers "the mutation was an add, not an edit" without a branch at
// the call site).
export function upsertById(arr, id, item) {
  const list = Array.isArray(arr) ? arr : [];
  const key = String(id);
  const idx = list.findIndex((row) => row && String(row.id) === key);
  if (idx < 0) return list.concat([item]);
  const out = list.slice();
  out[idx] = Object.assign({}, out[idx], item);
  return out;
}

// DOM helper: swap the markup of one row inside listEl (matched by
// `[data-id="<id>"]`, override via opts.selector) for `html`. No-op if the row
// isn't found (caller falls back to a full re-render). Returns true on patch.
export function patchCard(listEl, id, html, opts) {
  if (!listEl) return false;
  const sel = (opts && opts.selector) || '[data-id="' + id + '"]';
  const row = listEl.querySelector(sel);
  if (!row) return false;
  row.outerHTML = html;
  return true;
}
