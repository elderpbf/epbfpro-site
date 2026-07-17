// core/history.js — generic snapshot undo/redo over an opaque snapshot value.
// The caller provides getSnapshot()/applySnapshot(); we never inspect the value.
//
// Coalescing: record(label) collapses consecutive same-label records inside a
// short window into one step (so a burst of keystrokes or a slider drag = one
// undo), while a null/unique label always starts a fresh step.

export function createHistory({ getSnapshot, applySnapshot, max = 80, window = 700 }) {
  const past = [];
  const future = [];
  let lastLabel = null;
  let lastTime = 0;

  return {
    /** Capture the CURRENT state as an undo point. Call BEFORE mutating. */
    record(label) {
      const now = Date.now();
      if (label && label === lastLabel && now - lastTime < window) {
        lastTime = now;
        return; // same gesture, keep the earlier snapshot as the undo target
      }
      past.push(getSnapshot());
      if (past.length > max) past.shift();
      future.length = 0;
      lastLabel = label || null;
      lastTime = now;
    },
    undo() {
      if (!past.length) return false;
      future.push(getSnapshot());
      applySnapshot(past.pop());
      lastLabel = null;
      return true;
    },
    redo() {
      if (!future.length) return false;
      past.push(getSnapshot());
      applySnapshot(future.pop());
      lastLabel = null;
      return true;
    },
  };
}
