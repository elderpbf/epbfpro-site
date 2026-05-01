// engine/pill-icons.js
//
// Shared inline SVG icons for the panel-pills 'actions' kind. All use
// currentColor so they theme via --pn-text on the button. Sized 18x18.
// Add new icons here as more action pills land; keep them lean (single
// path or simple polylines, Lucide-style).

export const ICON_RESTART =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>';

export const ICON_PLAY =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" stroke="none"><polygon points="6 4 20 12 6 20"></polygon></svg>';

export const ICON_PAUSE =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect></svg>';

export const ICON_LOOP =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>';
