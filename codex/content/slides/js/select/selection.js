// select/selection.js
// ============================================================================
//  SCOPE LOCK: SLIDES-EDITOR-INTERNAL ONLY.
//  This unified selection model (one record + a per-kind descriptor registry +
//  one stage-docked bar) is a SLIDES-EDITOR contract. It must NOT be adopted by
//  any other Codex tab (Lessons, Questions, Cohorts, ...). Generalising it is a
//  category error; keep it inside content/slides/js/select/.
// ============================================================================
//
// The ONE selection record. `ref` is a LOGICAL locator (an asset id, the string
// "logo", or a slot path), NEVER a live DOM node, so it survives a full
// re-render / undo: the element is re-resolved from `ref` via the kind
// descriptor after every render. This replaces the three implicit notions the
// editor carried before (app.activeEditable, app.selected={fkey}, app.maskTarget).

export function createSelection() {
  let rec = null; // { kind, ref, slideId, editing }

  return {
    get() {
      return rec;
    },
    set(next) {
      rec = next || null;
      return rec;
    },
    clear() {
      rec = null;
    },
    has() {
      return rec != null;
    },
    is(kind) {
      return rec != null && rec.kind === kind;
    },
  };
}
