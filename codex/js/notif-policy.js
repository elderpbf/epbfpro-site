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
// CURRENT STATE (lean, per Élder): every item is 'open' — the whole bell
// self-dismisses on open, for both roles. The 'act' tier is a built-but-dormant
// seam; add rules below (keyed on item.type / item.kind / item.mine + role) when
// a needs-action notification actually lands. See manifest/ARCHITECTURE.md.
//
// BACKEND NOTE: real 'act' persistence across sessions also needs a per-item
// dismissal store in codex-api. Today "seen" is a single last_seen watermark
// (ct_forum_seen) which can only mark everything-before-a-time as seen, so it
// cannot hold "these dismissed, those still pending". While everything is 'open'
// the watermark is enough; the per-item store is deferred until 'act' is used.

export const DISMISS_OPEN = 'open';
export const DISMISS_ACT = 'act';

// dismissalFor(item, role) -> 'open' | 'act'
//   item: { type, kind?, mine?, ... } (the generic notification shape)
//   role: 'student' | 'admin' (defaults to 'student')
export function dismissalFor(item, role) {
  // For now every notification is informational and clears on open, both roles.
  // When an action-required notification exists, branch here on (item, role):
  //   e.g. if (role === 'admin' && item.kind === 'new_thread') return DISMISS_ACT;
  return DISMISS_OPEN;
}
