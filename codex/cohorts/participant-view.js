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

// THE action list, and the SINGLE source of what can be done to a person: every surface (the turma
// Participantes panel and the cross-turma Usuários roster) renders this same list and gates it the
// same way, so an action added here reaches both at once. Adding one in only one place is the bug
// that left "validar" missing from the roster (Élder 2026-07-14).
//
// An action is enabled only when EVERY selected row satisfies its predicate, and a predicate reads
// a row's TWO axes together — { status: access_status, verified: email_verified bool } — because
// approval and e-mail validation are independent (track-36, access.md §Os 3 conceitos).
//
// `validate` is the admin "validar acesso" (track-29): offered for ANY row whose e-mail is not
// confirmed yet, whatever its approval says. Élder settled this on merge (2026-07-15): "validation
// and approval are different and independent things."
//
// track-29 shipped the coupled rule `status === 'approved' && !verified`, on the rationale that it
// should only appear where the validation chip did. That rationale expired: the validação column now
// renders on EVERY row, and coupling the two contradicts access.md §Os 3 conceitos — a pending person
// really can be validated (enrolling outside the window validates the e-mail while approval waits),
// and validating them grants nothing on its own. It only decides how long their access lasts once
// approval does come.
//
// Only backend-wired actions live here; "revoke token" stays absent until its worker action ships,
// so the toolbar never grows a dead button.
export const ACTION_RULES = {
  approve:  (r) => r.status === 'pending',
  validate: (r) => !r.verified,   // ct_set_email_verified — its own axis, not approval's
  block:    (r) => r.status !== 'denied',
  unblock:  (r) => r.status === 'denied',
  remove:   () => true,
};

// The toolbar actions offered for a given gating state, in display order. Approval and validation
// only mean something when access is gated; without it everyone is simply in.
export function toolbarActions(gated) {
  return gated ? ['approve', 'validate', 'block', 'unblock', 'remove'] : ['remove'];
}

// Whether `action` is live for the selection: EVERY selected row must satisfy the rule, so an
// action that would be a no-op for part of the selection is not offered (Élder: "only the actions
// that can be done to all of the selected are available"). Each row is { status, verified }.
export function actionEnabled(action, rows) {
  const rule = ACTION_RULES[action];
  return !!(rule && rows.length > 0 && rows.every(rule));
}

// The access_status an action moves the selected rows to. null for the actions that don't
// re-status: `remove` deletes, `validate` flips the validation axis instead.
export function actionTargetStatus(action) {
  if (action === 'approve') return 'approved';
  if (action === 'block') return 'denied';
  if (action === 'unblock') return 'pending';
  return null;
}
