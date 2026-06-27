// codex/alunos/alunos-logic.js
// Pure, DOM-free helpers for the Alunos participants list (B+C2 mock):
//   - sectionParticipants: split + sort the roster into status sections
//   - toolbarState:        the adaptive-toolbar predicate map (which batch
//                          actions apply to the WHOLE current selection)
//   - avatarFor:           deterministic initials + tinted colour per participant
// No backend or rendering concerns live here, so each is unit-tested directly.
import { initials } from '../js/initials.js';

// Section display order: pending first, then approved, then blocked (denied).
export const SECTION_ORDER = ['pending', 'approved', 'denied'];

export function statusOf(p) {
  return (p && p.access_status) || 'pending';
}

// Split the roster into the three status sections, in display order, each with
// its items sorted by name (locale-aware). Empty sections are still returned so
// the caller decides whether to draw a header.
export function sectionParticipants(participants) {
  const list = Array.isArray(participants) ? participants : [];
  return SECTION_ORDER.map((status) => ({
    status,
    items: list
      .filter((p) => statusOf(p) === status)
      .sort((a, b) => String(a.display_name || a.name || '')
        .localeCompare(String(b.display_name || b.name || ''))),
  }));
}

// Adaptive-toolbar predicates, ported verbatim from the bc2 mock RULES:
//   aprovar     -> pending only
//   revogar     -> approved only (a live token to cut)
//   bloquear    -> anything not already denied
//   desbloquear -> denied only
//   remover     -> always
// "validar" is intentionally omitted (flow-dependent, resolved separately).
export const RULES = {
  aprovar:     (s) => s === 'pending',
  revogar:     (s) => s === 'approved',
  bloquear:    (s) => s !== 'denied',
  desbloquear: (s) => s === 'denied',
  remover:     () => true,
};

// Given the statuses of the current selection, return per action whether it
// applies to the WHOLE selection. An empty selection disables everything.
export function toolbarState(statuses) {
  const sel = Array.isArray(statuses) ? statuses : [];
  const out = {};
  for (const act of Object.keys(RULES)) {
    out[act] = sel.length > 0 && sel.every(RULES[act]);
  }
  return out;
}

// Deterministic avatar: 2-letter initials (shared rule, same as the Trail) over
// a faint tinted colour derived from a stable seed (the participant id or email).
// The tint is theme-stable by design, mirroring the tokens.css accent doctrine
// (the hue is a faint tint + saturated mid-tone, so it reads on light AND dark).
const AV_HUES = [
  { bg: 'rgba(217,119,6,0.14)',  fg: '#d97706' }, // amber
  { bg: 'rgba(59,130,246,0.14)', fg: '#2563eb' }, // blue
  { bg: 'rgba(124,58,237,0.14)', fg: '#7c3aed' }, // violet
  { bg: 'rgba(20,184,166,0.14)', fg: '#0d9488' }, // teal
  { bg: 'rgba(220,38,38,0.14)',  fg: '#dc2626' }, // red
  { bg: 'rgba(236,72,153,0.14)', fg: '#db2777' }, // pink
  { bg: 'rgba(99,102,241,0.14)', fg: '#4f46e5' }, // indigo
];

function hashSeed(seed) {
  const s = String(seed == null ? '' : seed);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// seed -> the stable colour (id/email); name -> the 2-letter initials.
export function avatarFor(seed, name) {
  const hue = AV_HUES[hashSeed(seed) % AV_HUES.length];
  return { initials: initials(name), bg: hue.bg, fg: hue.fg };
}
