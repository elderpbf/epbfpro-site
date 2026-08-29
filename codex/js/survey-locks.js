// codex/js/survey-locks.js
// The conditions of track-64 §3.7b, evaluated ONCE and read from two directions.
//
// The admin tab reads them to say WHY the send button is greyed. The student's
// Trilha reads the same ones to decide whether the survey covers the page. They are
// the same conditions, so they are the same code: a lock that drifts between the
// two screens either strands a student behind a wall the admin cannot see, or mails
// a survey mid-course. It sits in codex/js/ for the reason survey-question.js does —
// a cohorts/ module may not import across into trilha/ (tests/modules.test.mjs
// Test 5), so anything both sides need has to live here.
//
// PURE. No fetch, no DOM, no strings. A block is a CODE plus the data that explains
// it, and each caller's own dictionary turns it into a sentence (the admin and the
// Trail carry separate ones).
//
// The STATE it reads, which is one server response reshaped:
//   { status: 'draft'|'open'|'closed', sent_at, closes_at, now,   (unix seconds)
//     questions: [{ archived }], invitees, aulas: [{ aula_number, happened_on }],
//     answered }                                          (`answered` = student side)

export const SEND_BLOCKS = ['no_instrument', 'no_invitees', 'aulas_pending', 'already_sent', 'closed'];
export const GATE_BLOCKS = ['not_open', 'not_sent', 'window_closed', 'already_answered', 'aulas_pending'];

// "They must all be CHECKED as having occurred" (Élder 2026-08-27), so the mark is
// the predicate, not the calendar. js/aula-status.js answers a different question —
// which badge to paint — and calls a past-dated aula 'happened' whether or not
// anyone confirmed it. Reading that here would ungrey the send button on a date
// change, with nothing left for the diagnosis to name; the loud lock would go quiet
// exactly when it stopped holding. The consequence is deliberate: the send stays
// locked until the last aula is marked with the dossier's own button.
export function isMarkedHappened(aula) {
  return !!(aula && aula.happened_on);
}

// The aula numbers still unmarked, ascending. `null` means the caller does not KNOW
// (no aula list came back), which is not the same as none and is handled differently
// on each side: the admin blocks, the student does not gate.
export function aulasPending(aulas) {
  if (!Array.isArray(aulas)) return null;
  return aulas
    .filter((a) => !isMarkedHappened(a))
    .map((a) => Number((a && a.aula_number) || 0))
    .sort((x, y) => x - y);
}

// Live items only: an archived question is version history (§3.10), not instrument.
export function liveQuestions(questions) {
  return (questions || []).filter((q) => q && !q.archived);
}

export function isClosed(s) {
  const st = s || {};
  if (st.status === 'closed') return true;
  return !!(st.closes_at && st.now && st.now >= st.closes_at);
}

// Whole days left in the window, floored, never negative.
export function daysLeft(s) {
  const st = s || {};
  if (!st.closes_at || !st.now) return 0;
  return Math.max(0, Math.floor((st.closes_at - st.now) / 86400));
}

// Why the survey cannot be sent, in the order the admin should read them.
export function sendBlocks(s) {
  const st = s || {};
  const out = [];
  if (!liveQuestions(st.questions).length) out.push({ code: 'no_instrument' });
  if (!(st.invitees > 0)) out.push({ code: 'no_invitees' });
  const pend = aulasPending(st.aulas);
  if (pend === null || pend.length) out.push({ code: 'aulas_pending', aulas: pend || [] });
  if (st.sent_at) out.push({ code: 'already_sent' });
  if (isClosed(st)) out.push({ code: 'closed' });
  return out;
}

export function canSend(s) {
  return sendBlocks(s).length === 0;
}

// Why the student is NOT gated. Empty means every condition holds.
export function gateBlocks(s) {
  const st = s || {};
  const out = [];
  if (st.status !== 'open') out.push({ code: 'not_open' });
  if (!st.sent_at) out.push({ code: 'not_sent' });
  if (isClosed(st) || !st.closes_at) out.push({ code: 'window_closed' });
  if (st.answered) out.push({ code: 'already_answered' });
  const pend = aulasPending(st.aulas);
  if (pend === null || pend.length) out.push({ code: 'aulas_pending', aulas: pend || [] });
  return out;
}

// THE fail-open decision. A gate that appears because a fetch failed is exactly the
// stranded student Élder was worried about, so anything short of a complete, legible
// state means the trail renders normally. The guards below are not defensive
// padding: `now` and `aulas` are the two fields a partial response drops, and each
// one alone would otherwise let an unprovable condition read as satisfied.
export function shouldGate(s) {
  if (!s || typeof s !== 'object') return false;
  if (!(s.now > 0)) return false;
  if (!Array.isArray(s.aulas)) return false;
  return gateBlocks(s).length === 0;
}
