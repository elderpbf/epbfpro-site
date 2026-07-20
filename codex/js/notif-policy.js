// codex/js/notif-policy.js
// The dismissal-tier policy for bell notifications (js/notif-bell.js).
//
// THE TWO DEFINITIONS (Élder 2026-07-19 — do not blur these again):
//   'open' — DISPENSÁVEL: disappears on its own the moment the tray is OPENED. The user
//            does nothing; seeing it was the whole point.
//   'act'  — ACIONÁVEL: never disappears by being seen. It leaves ONLY when the user
//            clicks its × or clicks the notification itself — and then it goes to the
//            history. Those are the two ways, and they are the same for EVERY acionável.
// There is no third behaviour and no sub-rule inside 'act'. An earlier pass invented one
// ("clears on read" for some acionáveis but not others); it was wrong and is gone.
//
// ── Only ACIONÁVEIS are live right now (Élder 2026-07-19) ─────────────────────
// The split is KEPT below (splitTierFor) because a genuinely glance-only source will want
// it back, but with one tier live every notification behaves identically: it clears on ×
// or on click, and lands in the history. The bell reads DISPENSAVEIS_ENABLED to drop the
// history's two mini-tabs while only one tier can produce rows — naming a distinction the
// user cannot see is just chrome.
//
// BACKEND: 'act' persistence is backed by ct_notif_dismissed in codex-api (dismissed one at
// a time via ct_forum_dismiss / ct_forum_admin_dismiss); 'open' clears via the ct_forum_seen
// watermark. See manifest/architecture/notifications.md.

export const DISMISS_OPEN = 'open';
export const DISMISS_ACT = 'act';

// Flip to true to bring Dispensáveis back. Nothing else has to change: splitTierFor already
// holds the per-type map, and the bell restores the history tabs on its own.
export const DISPENSAVEIS_ENABLED = false;

// splitTierFor(item, role) -> 'open' | 'act'
// The per-type map, PRESERVED for when the split is re-enabled (and still tested, so it
// cannot rot while it is dormant). It is ROLE-AWARE on purpose: the same item can be a
// glance for a student and an action for the teacher.
//   ACT  — a tarefa submission (must be graded), a new forum thread (a question to answer),
//          a pending student in a gated turma (must be approved), the teacher's resposta/nota
//          on the student's own tarefa (they must go read it), a comunicado (a message).
//   OPEN — a forum reply (informational).
export function splitTierFor(item, role) {
  if (item && item.type === 'comunicado') return DISMISS_ACT;   // a message, for whoever gets it
  if (role === 'admin' && item) {
    if (item.type === 'tarefa_submission') return DISMISS_ACT;
    if (item.type === 'forum_post' && item.kind === 'new_thread') return DISMISS_ACT;
    if (item.type === 'student_pending') return DISMISS_ACT;   // e-sino: approve or dismiss by hand
  }
  if (role === 'student' && item) {
    if (item.type === 'tarefa_feedback') return DISMISS_ACT;   // resposta/nota do professor: ir ler
  }
  return DISMISS_OPEN;
}

// dismissalFor(item, role) -> 'open' | 'act'
// THE EFFECTIVE policy the bell obeys. While DISPENSAVEIS_ENABLED is false everything is
// acionável, so nothing ever vanishes merely because the tray was opened.
export function dismissalFor(item, role) {
  if (!DISPENSAVEIS_ENABLED) return DISMISS_ACT;
  return splitTierFor(item, role);
}
