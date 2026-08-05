// codex/trilha/js/state.js
// Shared state for the public Trail page modules: URL params (client / turma /
// token), admin flag, the fetched turma view, per-tab render flags, the mobile
// media query, and the icon set used by content action buttons. parseLocation()
// is pure (unit-tested); `state` is the page-lifetime singleton the modules share.
import { brandMark } from '../../js/brand-marks.js';
import { glyphSvg } from '../../js/glyphs.js';

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

// Icons for content action buttons, sourced from the shared library. These five were
// verbatim copies of keys js/glyphs.js already had, kept here only because the legacy
// Trilha.State.ICONS was ported wholesale.
//
// size:null on purpose: cards.css (.cdx-tr-item-action svg) owns BOTH the sizing (13px,
// 15px on mobile) and the paint (stroke-width 2.2, not the library's 2). CSS beats
// presentation attributes, so emitting width/height/stroke-width here would be silently
// overridden anyway. Omitting them says that out loud instead of pretending otherwise.
export const ICONS = {
  copy:     glyphSvg('copy', { size: null }),
  external: glyphSvg('external-link', { size: null }),
  download: glyphSvg('download', { size: null }),
  check:    glyphSvg('check', { size: null }),
  send:     glyphSvg('send', { size: null }),
  chevron:  glyphSvg('chevron-down', { size: null }),
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
