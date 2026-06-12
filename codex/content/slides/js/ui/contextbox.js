// ui/contextbox.js — a shared anchored PANEL popover (the "context box"): a viewport-fixed
// surface that hangs under a trigger button (or centers when none is given), closes on an
// outside click, and toggles when its own trigger is re-clicked. The image Gallery box is
// built on it; the Tema box can adopt it too, so the open / place / outside-click machinery
// lives in ONE place instead of being re-hand-rolled per panel. Storage-agnostic and app-
// agnostic: it only needs the root to mount into. `build()` returns the panel's inner
// content; `refresh()` re-runs `build()` in place (after the underlying model changed).
export function createContextBox({ root, className = "cdx-contextbox" } = {}) {
  let panel = null, anchor = null, onDoc = null, builder = null;

  function place() {
    if (!panel) return;
    panel.style.visibility = "hidden"; // measure before placing
    requestAnimationFrame(() => {
      if (!panel) return;
      const vw = document.documentElement.clientWidth;
      let left, top;
      if (anchor) {
        const r = anchor.getBoundingClientRect();
        left = r.left; top = r.bottom + 6;
      } else {
        left = (vw - panel.offsetWidth) / 2; top = 64;
      }
      if (left + panel.offsetWidth > vw - 8) left = vw - panel.offsetWidth - 8;
      panel.style.left = Math.max(8, left) + "px";
      panel.style.top = Math.max(8, top) + "px";
      panel.style.visibility = "";
    });
  }

  function close() {
    if (!panel) return;
    panel.remove();
    panel = null; anchor = null; builder = null;
    if (onDoc) { document.removeEventListener("mousedown", onDoc, true); onDoc = null; }
  }

  /** Open (or toggle, when re-opened from the SAME anchor). `build` is a zero-arg
   *  thunk returning the panel's inner element. */
  function open(build, anchorEl) {
    if (panel && anchor === (anchorEl || null)) { close(); return; }
    close();
    builder = build; anchor = anchorEl || null;
    panel = document.createElement("div");
    panel.className = className;
    panel.appendChild(build());
    root.appendChild(panel);
    place();
    onDoc = (e) => {
      if (!panel) return;
      if (panel.contains(e.target) || (anchor && anchor.contains(e.target))) return;
      close();
    };
    document.addEventListener("mousedown", onDoc, true);
  }

  function refresh() {
    if (!panel || !builder) return;
    panel.innerHTML = "";
    panel.appendChild(builder());
    place();
  }

  return { open, close, refresh, isOpen: () => !!panel, el: () => panel };
}
