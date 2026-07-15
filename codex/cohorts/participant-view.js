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

// THE action list. This module is the SINGLE source of what can be done to a person: every
// surface (the turma Participantes panel and the cross-turma Alunos roster) renders this same
// list and gates it the same way, so an action added here reaches both at once. Adding one in
// only one place is the bug that left "validar" missing from the roster (Élder 2026-07-14).
//
// A rule reads a ROW DESCRIPTOR { status, verified } rather than a bare status, because some
// actions key off validation rather than approval.
export const ACTION_RULES = {
  approve:  (r) => r.status === 'pending',
  block:    (r) => r.status !== 'denied',
  unblock:  (r) => r.status === 'denied',
  validate: (r) => !r.verified,   // confirm the e-mail by hand (ct_set_email_verified, track-29)
  remove:   () => true,
};

// The toolbar actions offered for a given gating state, in display order. Approval and validation
// only mean something when access is gated; without it everyone is simply in.
export function toolbarActions(gated) {
  return gated ? ['approve', 'block', 'unblock', 'validate', 'remove'] : ['remove'];
}

// Whether `action` is live for the selection: EVERY selected row must satisfy the rule, so an
// action that would be a no-op for part of the selection is not offered (Élder: "only the actions
// that can be done to all of the selected are available").
export function actionEnabled(action, rows) {
  const rule = ACTION_RULES[action];
  return !!(rule && rows.length > 0 && rows.every(rule));
}

// The access_status an action moves the selected rows to. null for the actions that don't
// re-status (`remove` deletes; `validate` flips email_verified instead).
export function actionTargetStatus(action) {
  if (action === 'approve') return 'approved';
  if (action === 'block') return 'denied';
  if (action === 'unblock') return 'pending';
  return null;
}
