// codex/trilha/js/state.js
// Shared state for the public Trail page modules: URL params (client / turma /
// token), admin flag, the fetched turma view, per-tab render flags, the mobile
// media query, and the icon set used by content action buttons. parseLocation()
// is pure (unit-tested); `state` is the page-lifetime singleton the modules share.
import { brandMark } from '../../js/brand-marks.js';

// Parse the trilha URL. Supports ?c=&t=&k= and the clean path
// /[codex/]trilha/<client>/<turma> (?k=<token>).
export function parseLocation(search, pathname) {
  const params = new URLSearchParams(search || '');
  let clientSlug = params.get('c');
  let turmaSlug = params.get('t');
  const token = params.get('k');
  if (!clientSlug || !turmaSlug) {
    const tail = String(pathname || '').replace(/^\/(?:codex\/)?trilha\/?/, '').replace(/\/$/, '');
    const parts = tail ? tail.split('/') : [];
    if (parts.length >= 2 && parts[0]) { clientSlug = parts[0]; turmaSlug = parts[1] || null; }
  }
  return { clientSlug: clientSlug || null, turmaSlug: turmaSlug || null, token: token || null };
}

// Inline SVG icons for content action buttons (copy / open / download / check /
// send). Copied verbatim from the legacy Trilha.State.ICONS.
export const ICONS = {
  copy:
    '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/>' +
    '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  external:
    '<svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>' +
    '<polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
  download:
    '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
    '<polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  check:
    '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
  send:
    '<svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/>' +
    '<polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
};

// The WhatsApp mark moved to the shared third-party registry (js/brand-marks.js). An icon
// parked in a state module is a place nobody thinks to look, which is precisely how the
// second hand-drawn copy gets born. Re-exported here so the `state.WA_ICON` seam that
// page.js reads keeps working untouched.
export const WA_ICON = brandMark('whatsapp');

export const state = {
  clientSlug: null,
  turmaSlug: null,
  token: null,
  isAdmin: false,

  data: null,
  outrosTypeFilter: null,
  rendered: { aulas: false, forum: false, apostila: false, outros: false, tarefas: false },

  mqMobile: null,

  ICONS,
  WA_ICON,

  init(search, pathname, win = (typeof window !== 'undefined' ? window : undefined)) {
    const loc = parseLocation(search, pathname);
    this.clientSlug = loc.clientSlug;
    this.turmaSlug = loc.turmaSlug;
    this.token = loc.token;

    const params = new URLSearchParams(search || '');
    if (params.has('admin')) {
      try {
        if (params.get('admin') === '1') localStorage.setItem('ct_is_admin', '1');
        else                              localStorage.removeItem('ct_is_admin');
      } catch (_) {}
    }
    try { this.isAdmin = localStorage.getItem('ct_is_admin') === '1'; } catch (_) { this.isAdmin = false; }

    this.mqMobile = (win && win.matchMedia) ? win.matchMedia('(max-width: 700px)') : null;
  },

  isFocusMode() { return !!(this.mqMobile && this.mqMobile.matches); },
};
