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
// row's status satisfies its predicate. Only backend-wired actions live here;
// "validate access" and "revoke token" are intentionally absent until those
// worker actions ship (otherwise they would be dead buttons).
export const ACTION_RULES = {
  approve: (st) => st === 'pending',
  block:   (st) => st !== 'denied',
  unblock: (st) => st === 'denied',
  remove:  () => true,
};

// The toolbar actions offered for a given gating state, in display order.
export function toolbarActions(gated) {
  return gated ? ['approve', 'block', 'unblock', 'remove'] : ['remove'];
}

// Whether `action` is enabled for the given array of selected row statuses.
export function actionEnabled(action, statuses) {
  const rule = ACTION_RULES[action];
  return !!(rule && statuses.length > 0 && statuses.every(rule));
}

// The access_status an action moves the selected rows to (null for `remove`,
// which deletes rather than re-statuses).
export function actionTargetStatus(action) {
  if (action === 'approve') return 'approved';
  if (action === 'block') return 'denied';
  if (action === 'unblock') return 'pending';
  return null;
}
