// codex/trilha/js/access.js
// Pure derivation of the Trail's access UI mode from the worker's turma-view
// `access` block ({ gated, mode, status }). The worker is the source of truth for
// `status`; this only maps the facts to a mode, so the DOM handlers (page/sub/flat)
// stay thin and every branch is unit-tested. Whether the feature is live at all is
// the caller's concern (LOGIN_ENABLED), deliberately kept OUT of here so the gated
// branches are testable while the master switch is still off.

// accessState ->
//   'open'          not gated: behave exactly as before
//   'approved'      gated, this session is approved: full content
//   'upfront-gated' gated, not approved: render the wall (the single register gate)
// Collapsed access model (#4, 2026-06-20): a gated turma is ALWAYS the upfront wall.
// The legacy 'inline' mode (and the 'inline-gated' state) is retired; `gate_mode` is
// inert. There is one gate now: register at the wall to enter.
export function accessState(access) {
  if (!access || !access.gated) return 'open';
  if (access.status === 'approved') return 'approved';
  return 'upfront-gated';
}

// Is the whole turma behind an upfront wall (no timeline until approved)?
export function isWall(access) {
  return accessState(access) === 'upfront-gated';
}

// What opening an item should do, for the inline gate:
//   'none'    not gated / already approved: open normally
//   'login'   gated, no session yet (anonymous): open the login modal
//   'pending' gated, logged in but awaiting approval: show the pending notice
//             (NOT the login form — the student is already authenticated)
export function gateAction(access) {
  const s = accessState(access);
  if (s !== 'upfront-gated') return 'none';
  return (access && access.status === 'pending') ? 'pending' : 'login';
}
