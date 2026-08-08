// The gate's vocabulary (js/access-model.js). The doctrine under test is NOT invented here — it is
// manifest/architecture/access.md §"Os 3 conceitos" (the 3 concepts). These tests exist because the SAME DB column
// rendered two different ways in two lists and both were wrong: the participants panel bucketed
// `enrollment` + `simple` into an else-branch and called them "Lista", while the Alunos roster
// printed the raw English column. Every live approved_via value is pinned here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  originOf,
  approvalOf,
  validationOf,
  accessOf,
  ORIGIN_I18N,
  APPROVAL_STATES,
} from '../js/access-model.js';

// The five values that actually exist in the live DB, plus the two written by real code paths
// that have no rows yet. Counts from prod on 2026-07-14.
test('originOf: every live approved_via maps to a real word', () => {
  assert.equal(originOf('manual'), 'manual', '48 live rows');
  assert.equal(originOf('enrollment'), 'janela', '14 live rows — THIS is the one that read "Lista"');
  assert.equal(originOf('simple'), 'emergencia', '9 live rows — also read "Lista"');
  assert.equal(originOf('presence'), 'janela', '8 live rows');
  assert.equal(originOf('roster'), 'lista', 'written by the pre-approve path');
  assert.equal(originOf('window'), 'janela', 'legacy ClassPulse session');
});

test('originOf: enrollment/presence/window are ONE word to the admin', () => {
  // Élder: "window, not presence; what is enrollment?" — three internal paths, one janela.
  const w = new Set(['enrollment', 'presence', 'window', 'qr'].map(originOf));
  assert.deepEqual([...w], ['janela'], 'all four internal ways in read as the janela');
});

test('originOf: an unknown value returns null instead of a plausible default', () => {
  // The else-branch is the bug. An unmapped value must show NOTHING, never guess "Lista".
  assert.equal(originOf('some_new_path_we_add_in_2027'), null);
  assert.equal(originOf(null), null, 'ungated turma (approved_via IS NULL)');
  assert.equal(originOf(undefined), null);
  assert.equal(originOf(''), null);
});

test('originOf: tolerates case and stray whitespace from the DB', () => {
  assert.equal(originOf('  ENROLLMENT '), 'janela');
  assert.equal(originOf('Manual'), 'manual');
});

test('every origin has an i18n key (no word can render as a raw slug)', () => {
  for (const via of ['manual', 'roster', 'enrollment', 'presence', 'window', 'simple']) {
    const o = originOf(via);
    assert.ok(ORIGIN_I18N[o], 'origin "' + o + '" (from ' + via + ') has a key');
  }
});

// ── approval: state while pending/denied, origin once approved ───────────────────
test('approvalOf: not-yet-approved shows the STATE (the actionable fact)', () => {
  assert.deepEqual(
    (({ kind, value }) => ({ kind, value }))(approvalOf({ access_status: 'pending' })),
    { kind: 'state', value: 'pending' }
  );
  assert.equal(approvalOf({ access_status: 'denied' }).value, 'denied');
  assert.equal(approvalOf({}).value, 'pending', 'blank status counts as pending');
  // a pending row that somehow carries a via must STILL read pending — approval is the question.
  assert.equal(approvalOf({ access_status: 'pending', approved_via: 'manual' }).value, 'pending');
});

test('approvalOf: approved shows WHERE it came from', () => {
  assert.deepEqual(
    (({ kind, value }) => ({ kind, value }))(approvalOf({ access_status: 'approved', approved_via: 'enrollment' })),
    { kind: 'origin', value: 'janela' }
  );
  assert.equal(approvalOf({ access_status: 'approved', approved_via: 'simple' }).value, 'emergencia');
  assert.equal(approvalOf({ access_status: 'approved', approved_via: 'roster' }).value, 'lista');
});

test('approvalOf: approved with no/unknown origin says "Aprovado", it does NOT invent "Lista"', () => {
  const a = approvalOf({ access_status: 'approved', approved_via: null });
  assert.equal(a.kind, 'state');
  assert.equal(a.value, 'approved');
});

test('approvalOf: every result carries a key and a tone (so both lists paint alike)', () => {
  const rows = [
    { access_status: 'pending' }, { access_status: 'denied' }, { access_status: 'approved' },
    { access_status: 'approved', approved_via: 'manual' },
    { access_status: 'approved', approved_via: 'enrollment' },
    { access_status: 'approved', approved_via: 'simple' },
    { access_status: 'approved', approved_via: 'roster' },
  ];
  for (const r of rows) {
    const a = approvalOf(r);
    assert.ok(a.i18n, 'has an i18n key');
    assert.ok(/^cdx-badge-/.test(a.tone), 'has a badge tone: ' + a.tone);
  }
});

test('APPROVAL_STATES is the closed set', () => {
  assert.deepEqual(APPROVAL_STATES, ['pending', 'approved', 'denied']);
});

// ── validation: proves the inbox exists. Nothing else. ────────────────────────────
test('validationOf: the flag, and only the flag', () => {
  assert.equal(validationOf({ email_verified: 1 }).validated, true);
  assert.equal(validationOf({ email_verified: 0 }).validated, false);
  assert.equal(validationOf({}).validated, false);
  // approval must not leak into validation — they are independent axes.
  assert.equal(validationOf({ access_status: 'approved' }).validated, false);
});

// ── access: the live session. Has a deadline and EXPIRES. ─────────────────────────
const NOW = 1_700_000_000;

test('accessOf: no approval means there is no session to speak of', () => {
  // Not "expired" — empty. access.md: no approval → no access.
  assert.equal(accessOf({ access_status: 'pending', session_expires_at: NOW + 999 }, NOW).state, 'none');
  assert.equal(accessOf({ access_status: 'denied' }, NOW).state, 'none');
});

test('accessOf: approved but never entered vs lapsed vs live', () => {
  assert.equal(accessOf({ access_status: 'approved', session_expires_at: null }, NOW).state, 'never');
  assert.equal(accessOf({ access_status: 'approved', session_expires_at: NOW - 1 }, NOW).state, 'lapsed');
  assert.equal(accessOf({ access_status: 'approved', session_expires_at: NOW + 60 }, NOW).state, 'live');
});

test('accessOf: validation decides the DURATION, so it decides the label', () => {
  // access.md §Constants: validated -> 15 days durable; not validated -> 12h provisional.
  const live = (v) => accessOf({ access_status: 'approved', email_verified: v, session_expires_at: NOW + 3600 }, NOW);
  assert.equal(live(1).provisional, false);
  assert.equal(live(1).i18n, 'access.left');
  assert.equal(live(0).provisional, true, 'unvalidated access is provisional even while live');
  assert.equal(live(0).i18n, 'access.left_provisional');
  assert.equal(live(1).secondsLeft, 3600);
});

test('accessOf: an approved+validated person with an expired session has NO access', () => {
  // Élder's exact case: "the person can be validated, approved and not have access until it validates again".
  const a = accessOf({ access_status: 'approved', email_verified: 1, session_expires_at: NOW - 10 }, NOW);
  assert.equal(a.state, 'lapsed');
});
