// engine/focus-reclaim.js
//
// Shared helper: reclaim focus from iframes so the parent's keydown
// handler keeps receiving keyboard events. Particularly important when
// users click inside cross-origin iframes (Google Slides, etc.) which
// would otherwise capture all subsequent keystrokes.
//
// Two callers today:
//   - main deck (?presenter unset): reclaims to its own window.
//   - mirror inside presenter view (?presenter=mirror): reclaims to
//     window.parent so the presenter window's keydown handler fires.

export function attachFocusReclaim(options = {}) {
  const targetWindow = options.targetWindow || window;
  const settleMs     = typeof options.settleMs === 'number' ? options.settleMs : 80;
  const sweepMs      = typeof options.sweepMs  === 'number' ? options.sweepMs  : 600;

  function onMouseDown(e) {
    if (e.target && e.target.tagName === 'IFRAME') {
      setTimeout(() => { try { targetWindow.focus(); } catch (_) {} }, settleMs);
    }
  }

  function sweep() {
    if (document.activeElement && document.activeElement.tagName === 'IFRAME') {
      try { targetWindow.focus(); } catch (_) {}
    }
  }

  document.addEventListener('mousedown', onMouseDown, true);
  const interval = setInterval(sweep, sweepMs);

  return {
    stop() {
      document.removeEventListener('mousedown', onMouseDown, true);
      clearInterval(interval);
    },
  };
}
