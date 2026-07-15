// js/access-model.js
// THE vocabulary of the student gate, for every admin surface (track-28a2, Élder 2026-07-14).
//
// The doctrine is NOT invented here — it is `manifest/architecture/access.md` §"Os 3 conceitos
// (independentes, NÃO confundir)". This module only teaches the UI to say it. Three axes, never
// to be conflated:
//
//   APROVAÇÃO  — "esta pessoa PODE ter acesso": pending / approved / denied, plus WHERE it came
//                from (approved_via). Nothing to do with the e-mail existing.
//   VALIDAÇÃO  — proof of inbox possession (email_verified). Alone it gives NO access; it only
//                qualifies the DURATION (validado -> 15 dias, não validado -> 12h provisório).
//   ACESSO     — the live session. It has a deadline and it EXPIRES. Expired = no access even
//                when approved AND validated.
//
// WHY THIS FILE EXISTS: the two lists each grew their own vocabulary and both ended up wrong.
// `alunos.via_*` had no word for `enrollment` (it printed the raw English), and the participants
// panel bucketed `enrollment` + `simple` into its else-branch and called 23 people "Lista" when
// they came through the janela or the emergência. Same DB column, two renderers, two lies. One
// map, one set of keys, every surface reads from here.
import { t } from './i18n.js';
import { esc } from './dom.js';

// ── APROVAÇÃO ─────────────────────────────────────────────────────────────────────
export const APPROVAL_STATES = ['pending', 'approved', 'denied'];

// approved_via (raw, as stored) -> the one word the admin sees. Live values: manual(48),
// enrollment(14), simple(9), presence(8), null(1). `roster` and `window` are written/returned by
// real code paths that simply have no live rows yet, so they map too.
//   enrollment = entrou pela janela de matrícula (código/QR aberto na aula)
//   presence   = o aparelho já estava na aula (grant de presença, dentro da mesma janela)
//   window     = legado ClassPulse (sessão aberta) — mesma ideia, mesma palavra
//   simple     = "Emergência" (e-mail + nome, 8h COM identidade) — access.md §Mecânica
const ORIGIN_OF = {
  manual: 'manual',
  roster: 'lista',
  enrollment: 'janela',
  presence: 'janela',
  window: 'janela',
  qr: 'janela',
  simple: 'emergencia',
};

// null when the turma is not gated (approved_via IS NULL) or the value is unknown — the caller
// shows nothing rather than inventing a word. An unknown value must never fall through to a
// plausible-looking default; that silent else-branch is exactly what produced the "Lista" lie.
export function originOf(via) {
  const v = String(via == null ? '' : via).trim().toLowerCase();
  return ORIGIN_OF[v] || null;
}

export const ORIGIN_I18N = {
  manual: 'access.origin_manual',
  lista: 'access.origin_lista',
  janela: 'access.origin_janela',
  emergencia: 'access.origin_emergencia',
};

// The badge tone per origin, so both lists colour the same word the same way.
export const ORIGIN_TONE = {
  manual: 'cdx-badge-success',
  lista: 'cdx-badge-primary',
  janela: 'cdx-badge-accent',
  emergencia: 'cdx-badge-info',
};

export const STATE_I18N = {
  pending: 'access.state_pending',
  denied: 'access.state_denied',
  approved: 'access.state_approved',
};

export const STATE_TONE = {
  pending: 'cdx-badge-task',
  denied: 'cdx-badge-danger',
  approved: 'cdx-badge-success',
};

// What the aprovação cell says: a person who is not yet approved shows the STATE (the thing you
// must act on); an approved one shows WHERE the approval came from. access.md: "Quem já está
// aprovado não mostra situação, só a origem acima."
export function approvalOf(row) {
  const st = String((row && row.access_status) || 'pending').toLowerCase();
  if (st !== 'approved') {
    const state = st === 'denied' ? 'denied' : 'pending';
    return { kind: 'state', value: state, i18n: STATE_I18N[state], tone: STATE_TONE[state] };
  }
  const origin = originOf(row && row.approved_via);
  if (!origin) return { kind: 'state', value: 'approved', i18n: STATE_I18N.approved, tone: STATE_TONE.approved };
  return { kind: 'origin', value: origin, i18n: ORIGIN_I18N[origin], tone: ORIGIN_TONE[origin] };
}

// THE aprovação badge. Both lists render this exact markup, so the word AND its colour agree by
// construction. Two renderers reading one map would still be two renderers; this is one.
export function approvalTagHtml(row) {
  const a = approvalOf(row);
  const teal = a.value === 'janela' ? ' style="--acc:var(--acc-teal)"' : '';
  return '<span class="cdx-badge ' + a.tone + '"' + teal + '>' + esc(t(a.i18n)) + '</span>';
}

// ── VALIDAÇÃO ─────────────────────────────────────────────────────────────────────
export function validationOf(row) {
  const ok = !!(row && (row.email_verified === 1 || row.email_verified === true));
  return { validated: ok, i18n: ok ? 'access.validated' : 'access.unvalidated' };
}

// ── ACESSO ────────────────────────────────────────────────────────────────────────
// The live session, from access.md §Constantes: durável (validado) = 15 dias · provisório (não
// validado) = 12h · Emergência/simple = 8h. `expires_at` is a unix timestamp (seconds).
// Never approved -> there is no session to speak of, so the cell is empty, NOT "expired".
export function accessOf(row, nowSec) {
  const now = Number(nowSec) || Math.floor(Date.now() / 1000);
  const approved = String((row && row.access_status) || '').toLowerCase() === 'approved';
  if (!approved) return { state: 'none', i18n: null };
  const exp = row && row.session_expires_at != null ? Number(row.session_expires_at) : null;
  if (exp == null) return { state: 'never', i18n: 'access.never' };
  if (exp <= now) return { state: 'lapsed', i18n: 'access.lapsed' };
  const provisional = !(row.email_verified === 1 || row.email_verified === true);
  return {
    state: 'live',
    provisional,
    secondsLeft: exp - now,
    i18n: provisional ? 'access.left_provisional' : 'access.left',
  };
}
