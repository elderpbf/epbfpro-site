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

  // Don't yank focus away if the user is typing somewhere this would
  // disrupt: in the target window (parent), or inside a same-origin iframe
  // (e.g. ClassPulse host input embedded in a panel).
  function isTypingElement(el) {
    if (!el) return false;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return true;
    if (el.isContentEditable) return true;
    return false;
  }

  function isTypingInTarget() {
    try {
      return isTypingElement(targetWindow.document.activeElement);
    } catch (_) {
      return false;
    }
  }

  function isTypingInsideIframe(iframe) {
    try {
      const doc = iframe.contentDocument;
      if (!doc) return false; // cross-origin or not loaded
      return isTypingElement(doc.activeElement);
    } catch (_) {
      return false; // cross-origin throws
    }
  }

  function onMouseDown(e) {
    if (e.target && e.target.tagName === 'IFRAME') {
      const iframe = e.target;
      setTimeout(() => {
        if (isTypingInTarget()) return;
        if (isTypingInsideIframe(iframe)) return;
        try { targetWindow.focus(); } catch (_) {}
      }, settleMs);
    }
  }

  function sweep() {
    const active = document.activeElement;
    if (active && active.tagName === 'IFRAME') {
      if (isTypingInTarget()) return;
      if (isTypingInsideIframe(active)) return;
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
