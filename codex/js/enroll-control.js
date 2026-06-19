// codex/js/enroll-control.js
// Shared in-class enrollment projection control. The QR enrollment window lives
// purely in server state (an open window + a qr_shown flag), so the host panel and
// the projector display act on ONE source of truth: pressing the QR button does the
// same thing no matter which surface it sits on (Élder: "é tudo o mesmo código").
import { enrollUrl } from './enroll-clock.js';

// Window open AND the QR currently projected on the display?
export function isProjecting(state) { return !!(state && state.open && state.qr_shown); }

// Map a "toggle QR" press to the facade. Projecting -> un-project (the window STAYS
// open, its countdown keeps running). Not projecting -> open (mints a window only if
// none is live; otherwise reuses it, no reset, no new link) and project the QR.
export function toggleProjection(api, ids, state) {
  if (isProjecting(state)) return api.setEnrollmentQr({ ...ids, shown: 0 });
  return api.openEnrollment(ids);
}

// The QR image src for a projected window. ids = { client_slug, slug }; size in px.
export function enrollQrSrc(state, ids, size) {
  const url = enrollUrl('https://pensoia.com', ids.client_slug, ids.slug, state.turma_token, state.enrollment_token);
  return 'https://api.qrserver.com/v1/create-qr-code/?size=' + size + 'x' + size + '&margin=2&data=' + encodeURIComponent(url);
}

// The short typed-entry address shown next to the QR: pensoia.com/trilha/<code>, where
// <code> is the 4-digit enrollment code. Display form (no scheme), the entry page itself
// redirects on the current origin so staging stays on staging.
export function entrarUrl(code) { return 'pensoia.com/trilha/' + (code || ''); }
