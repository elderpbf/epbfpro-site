// cohorts/participant-view.js
// Pure decision logic for the dossier "Participantes" list (the B+C2 design),
// split out so the REAL rules are unit-testable without a DOM. The render +
// wiring stays in cohorts.js; this module owns only WHAT to show, never HOW.

// Approval (pending / approved / blocked) only means something when access is
// actually gated, i.e. the turma issues a certificate OR restricts access. With
// neither on, everyone who registers is simply in, so the list collapses to a
// flat roster and the approve/block axis disappears (Élder, 2026-06).
export function isApprovalGated(turma) {
  if (!turma) return false;
  return !!(turma.certificates_enabled || turma.access_gated);
}

function statusOf(p) {
  return (p && p.access_status) || 'pending';
}

function byName(a, b) {
  return String(a.display_name || a.name || '').localeCompare(String(b.display_name || b.name || ''));
}

// Flat, name-sorted list (the non-gated roster).
export function sortByName(participants) {
  return participants.slice().sort(byName);
}

// Grouped pending -> approved -> denied, each name-sorted (the gated view).
// Returns an ordered array of { status, rows }, with only the non-empty groups.
export function groupParticipantsByStatus(participants) {
  const groups = { pending: [], approved: [], denied: [] };
  participants.forEach((p) => {
    const st = statusOf(p);
    (groups[st] || groups.pending).push(p);
  });
  return ['pending', 'approved', 'denied']
    .map((status) => ({ status, rows: groups[status].sort(byName) }))
    .filter((g) => g.rows.length);
}

// Adaptive-toolbar rules (B+C2): an action is enabled only when EVERY selected
// row satisfies its predicate. Each predicate reads a row's TWO axes together —
// { status: access_status, verified: email_verified bool } — because approval and
// e-mail validation are independent (track-36). `validate` is the admin "validar
// acesso" (track-29): offered for an approved-but-not-yet-validated row, where the
// validation chip is shown, so the button and the chip agree. Only backend-wired
// actions live here; "revoke token" stays absent until its worker action ships.
export const ACTION_RULES = {
  approve:  (r) => r.status === 'pending',
  validate: (r) => r.status === 'approved' && !r.verified,
  block:    (r) => r.status !== 'denied',
  unblock:  (r) => r.status === 'denied',
  remove:   () => true,
};

// The toolbar actions offered for a given gating state, in display order.
export function toolbarActions(gated) {
  return gated ? ['approve', 'validate', 'block', 'unblock', 'remove'] : ['remove'];
}

// Whether `action` is enabled for the given array of selected rows. Each row is
// { status, verified }; the action is live only when EVERY selected row permits it.
export function actionEnabled(action, rows) {
  const rule = ACTION_RULES[action];
  return !!(rule && rows.length > 0 && rows.every(rule));
}

// The access_status an action moves the selected rows to (null when the action
// does not re-status: `remove` deletes, `validate` flips the validation axis).
export function actionTargetStatus(action) {
  if (action === 'approve') return 'approved';
  if (action === 'block') return 'denied';
  if (action === 'unblock') return 'pending';
  return null;
}
