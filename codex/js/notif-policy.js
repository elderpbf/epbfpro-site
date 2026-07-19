// codex/js/notif-policy.js
// The dismissal-tier policy for bell notifications (js/notif-bell.js). A
// notification's dismissal behaviour is a function of (item, role):
//   'open' — auto-dismiss as soon as the tray is opened. The DEFAULT: plain
//            information the user just needs to see (a new forum reply/topic).
//   'act'  — persists until the action is completed or the item is dismissed by
//            hand. For notifications the user must DO something about.
// It is ROLE-AWARE on purpose: the SAME item can be 'open' for a student and
// 'act' for the admin (or vice-versa) — e.g. a new forum question is just info
// for a classmate but an action for the teacher.
//
// CURRENT STATE (Élder 2026-07-09): the admin bell splits into two tiers.
//   ACT (Acionáveis) — needs the teacher to DO something, persists past open:
//     * a tarefa submission (must be reviewed/graded)
//     * a new forum thread (a student question to answer)
//     * a pending student in a gated turma (must be approved — the e-sino, track-36 e)
//   OPEN (Dispensáveis) — a glance, clears on open:
//     * a forum reply (informational)
// The student bell (Élder 2026-07-14) is the MIRROR, not a lesser copy: the teacher's
// resposta/nota on the student's own tarefa is ACIONÁVEL (they must go read it — it is
// the exact counterpart of the admin's 'tarefa_submission'), while forum activity stays
// a glance. Same module, same tiers, both directions.
//
// BACKEND: 'act' persistence is now backed by ct_notif_dismissed in codex-api
// (dismissed one at a time via ct_forum_admin_dismiss); 'open' still clears via the
// ct_forum_seen watermark (scope 'glance' on bell-open). See manifest/ARCHITECTURE.md.

export const DISMISS_OPEN = 'open';
export const DISMISS_ACT = 'act';

// dismissalFor(item, role) -> 'open' | 'act'
//   item: { type, kind?, mine?, ... } (the generic notification shape)
//   role: 'student' | 'admin' (defaults to 'student')
export function dismissalFor(item, role) {
  // A comunicado (track-44) is ACIONÁVEL for whoever receives it: it is a MESSAGE, and a
  // message clears when the person read it or dismissed it by hand — never merely because
  // the tray was opened. Role-independent, so it holds in both directions.
  if (item && item.type === 'comunicado') return DISMISS_ACT;
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

// clearsOnRead(item, role) -> boolean
// Which ACIONÁVEIS are DONE the moment they are opened, so opening one clears it exactly as
// its × does (Élder 2026-07-19: "ou eu clico no xinho, ou eu abro, li a mensagem — ela tem
// que deixar de contar como nova e ir pro histórico, na categoria correta").
//
// The split is deliberate and load-bearing: an item whose action IS READING is complete once
// read (a comunicado IS its message; the professor's resposta is read on the tarefa). An item
// that needs WORK done — grade the tarefa, approve the pending student — must NOT vanish just
// because the teacher clicked through to go do it. Those still clear only via × / "marcar tudo".
export function clearsOnRead(item, role) {
  if (!item) return false;
  if (item.type === 'comunicado') return true;
  if (role === 'student' && item.type === 'tarefa_feedback') return true;
  return false;
}
