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

export const ICON_PIN =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14l-1.7-2.55A2 2 0 0 1 17 13.34V6h1V4H6v2h1v7.34a2 2 0 0 1-.3 1.06z"></path></svg>';

export const ICON_REFRESH =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"></path><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"></path></svg>';
