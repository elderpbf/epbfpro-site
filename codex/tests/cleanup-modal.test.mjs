// cohorts/cleanup-modal.js — the "Limpeza" tool (Élder 2026-07-15: "let's change the duplication
// name to cleanup, so the duplications stay the same and you can add a list of possible test
// registrations for deletion").
//
// What these pin is the SAFETY of the destructive half, not a snapshot: nothing pre-selected, the
// reasons always visible, and the counter covering both sections.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanupButtonHtml, testRowHtml, segmentedHtml, pairHtml } from '../cohorts/cleanup-modal.js';

const cand = (o = {}) => ({
  id: o.id || 66,
  email: o.email || 'hpipnjrfehgiypgkyj@vtmpj.com',
  name: o.name === undefined ? 'cc' : o.name,
  turma_name: o.turma_name || 'Turma Teste',
  participant_ids: o.participant_ids || [101],
  last_access_at: o.last_access_at === undefined ? null : o.last_access_at,
  reasons: o.reasons || { gibberishLocal: true, junkName: true, reservedDomain: false },
});

test('the button counts BOTH sections — one badge for everything awaiting a verdict', () => {
  const h = cleanupButtonHtml(6, 12);
  assert.match(h, />18</);
  assert.doesNotMatch(h, /disabled/);
});

test('nothing to clean up disables the button and drops the badge', () => {
  const h = cleanupButtonHtml(0, 0);
  assert.match(h, /disabled/);
  assert.doesNotMatch(h, /cdx-al-dupes-n/);
});

test('a badge appears when only ONE section has work', () => {
  assert.match(cleanupButtonHtml(0, 3), />3</);
  assert.match(cleanupButtonHtml(3, 0), />3</);
});

test('the button says Limpeza, not Duplicatas — the tool is broader than duplicates now', () => {
  const h = cleanupButtonHtml(1, 1);
  assert.match(h, /Limpeza/);
  assert.doesNotMatch(h, /Duplicatas/);
});

test('NOTHING is pre-selected: this delete purges a person and there is no undo', () => {
  // The duplicates section deliberately pre-checks its suggestion; this one must never.
  // Élder: "do nothing should be the default, so I can choose to do something about it."
  const h = testRowHtml(cand());
  assert.match(h, /type="checkbox"/);
  assert.doesNotMatch(h, /checked/);
});

test('every candidate shows WHY, so nobody is deleted blind', () => {
  assert.match(testRowHtml(cand()), /e-mail sem sentido/);
  assert.match(testRowHtml(cand()), /nome de teste/);
  assert.match(
    testRowHtml(cand({ email: 'eduarda.santos@example.com', name: 'Eduarda Ribeiro Santos',
      reasons: { reservedDomain: true, gibberishLocal: false, junkName: false } })),
    /domínio de exemplo/
  );
});

test('a reason that did NOT fire is not shown', () => {
  const h = testRowHtml(cand({ reasons: { gibberishLocal: true, junkName: false, reservedDomain: false } }));
  assert.match(h, /e-mail sem sentido/);
  assert.doesNotMatch(h, /nome de teste/);
  assert.doesNotMatch(h, /domínio de exemplo/);
});

test('the row carries the participant rows the delete has to walk', () => {
  const h = testRowHtml(cand({ id: 72, participant_ids: [11, 22] }));
  assert.match(h, /data-id="72"/);
  assert.match(h, /data-pids="11,22"/);
});

test('never-accessed says so rather than showing an empty gap', () => {
  assert.match(testRowHtml(cand({ last_access_at: null })), /nunca acessou/);
  assert.match(testRowHtml(cand({ last_access_at: 1_700_000_000 })), /último acesso/);
});

test('a nameless registration still renders (a missing name is not a crash)', () => {
  const h = testRowHtml(cand({ name: null }));
  assert.match(h, /cdx-test-row/);
  assert.doesNotMatch(h, /null/);
});

test('the e-mail is escaped, not injected — this list is full of hostile-looking strings', () => {
  const h = testRowHtml(cand({ email: '<img src=x onerror=alert(1)>@x.com', name: '<b>cc</b>' }));
  assert.doesNotMatch(h, /<img/);
  assert.doesNotMatch(h, /<b>/);
  assert.match(h, /&lt;img/);
});

// ── the 3-state verdict pill ────────────────────────────────────────────────────────
// Élder asked for this three times before it got built, so these pin the exact semantics he
// specified rather than whatever the markup happens to do.
const OPTS = [
  { value: 'merge', label: 'Mesclar', hint: 'sugerido' },
  { value: 'not', label: 'Não é a mesma' },
  { value: 'leave', label: 'Deixar assim' },
];

test('the pill is a segmented control, NOT checkboxes', () => {
  const h = segmentedHtml('same-0', OPTS, 'leave');
  assert.doesNotMatch(h, /type="checkbox"/);
  assert.match(h, /role="radiogroup"/);
  assert.equal((h.match(/type="radio"/g) || []).length, 3);
});

test('three segments, and exactly ONE is live', () => {
  const h = segmentedHtml('same-0', OPTS, 'leave');
  assert.equal((h.match(/cdx-seg-opt/g) || []).length, 3);
  assert.equal((h.match(/ checked/g) || []).length, 1);
  assert.equal((h.match(/is-on/g) || []).length, 1);
});

test('"deixar assim" is the DEFAULT — nothing happens to a pair he never looked at', () => {
  const h = segmentedHtml('same-0', OPTS, 'leave');
  // the checked radio must be the leave one, not merge and not not-the-same
  assert.match(h, /value="leave" checked/);
  assert.doesNotMatch(h, /value="merge" checked/);
  assert.doesNotMatch(h, /value="not" checked/);
});

test('the suggestion is SHOWN but not selected — otherwise "aceitar todas" is a black box', () => {
  const h = segmentedHtml('same-0', OPTS, 'leave');
  assert.match(h, /sugerido/);
  // ...and the segment carrying the hint is still not the checked one
  const merge = h.slice(h.indexOf('value="merge"'), h.indexOf('value="not"'));
  assert.match(merge, /sugerido/);
  assert.doesNotMatch(merge, /checked/);
});

test('the radios share one name per pair, so the three states are mutually exclusive', () => {
  const h = segmentedHtml('same-3', OPTS, 'leave');
  assert.equal((h.match(/name="same-3"/g) || []).length, 3);
});

test('labels are escaped like everything else', () => {
  const h = segmentedHtml('x', [{ value: 'a', label: '<b>hi</b>' }, { value: 'b', label: 'ok' }], 'b');
  assert.doesNotMatch(h, /<b>hi<\/b>/);
  assert.match(h, /&lt;b&gt;/);
});

// ── the pair still has to SHOW the pair ──────────────────────────────────────────────
// The regression these exist for: converting to the pill, I hid the two identities behind the
// "mesclar" state. Élder opened it to "mesmo usuário, domínio diferente" + three buttons "and
// nothing else, no name, no email, nothing" — a duplicate pair with the two people missing, which is
// the entire question. Never again.
const pair = (o = {}) => ({
  a: { id: 15, name: 'Maiana Pessoa', email: 'maianapessoa@gmail.com', turma_count: 1, email_verified: 1 },
  b: { id: 63, name: 'Maiana Alves Pessoa', email: 'maianapessoa@agu.gov.br', turma_count: 1, email_verified: 0 },
  reasons: { sameLocal: true, nearEmail: false, sameName: false, nearName: true },
  suggestion: o.suggestion || 'keep_a',
});

test('BOTH names and BOTH e-mails are on screen from the start — that IS the question', () => {
  const h = pairHtml(pair(), 0);
  assert.match(h, /Maiana Pessoa/);
  assert.match(h, /Maiana Alves Pessoa/);
  assert.match(h, /maianapessoa@gmail\.com/);
  assert.match(h, /maianapessoa@agu\.gov\.br/);
});

test('the identities are NOT hidden at the default verdict', () => {
  // The exact bug: <div class="cdx-dup-names" hidden> while the pill sits on "deixar assim".
  const h = pairHtml(pair(), 0);
  const names = h.slice(h.indexOf('cdx-dup-names'));
  assert.doesNotMatch(names.slice(0, 40), /hidden/);
});

test('each identity still carries its turmas and its validation mark', () => {
  const h = pairHtml(pair(), 0);
  assert.match(h, /1 turma\(s\)/);
  assert.match(h, /✓/);   // the verified side
  assert.match(h, /•/);   // the unverified side
});

test('the pair opens on "deixar assim" with the suggestion merely marked', () => {
  const h = pairHtml(pair({ suggestion: 'keep_a' }), 0);
  assert.match(h, /value="leave" checked/);
  assert.doesNotMatch(h, /value="merge" checked/);
  assert.match(h, /sugerido/);
});

test('a not_dup suggestion marks the "não é a mesma" segment, still without selecting it', () => {
  const h = pairHtml(pair({ suggestion: 'not_dup' }), 0);
  assert.match(h, /value="leave" checked/);
  const notSeg = h.slice(h.indexOf('value="not"'), h.indexOf('value="leave"'));
  assert.match(notSeg, /sugerido/);
});

test('the survivor radio reflects the suggestion, ready for when merge is picked', () => {
  assert.match(pairHtml(pair({ suggestion: 'keep_b' }), 0), /value="keep_b" checked/);
  assert.match(pairHtml(pair({ suggestion: 'keep_a' }), 0), /value="keep_a" checked/);
});

test('...but neither identity is PAINTED as chosen while the verdict is still "deixar assim"', () => {
  // Highlighting one side on open would contradict the modal's one promise: nothing is decided
  // until you decide it. The highlight is _syncPair's job, once the pair is really merging.
  assert.doesNotMatch(pairHtml(pair({ suggestion: 'keep_a' }), 0), /cdx-dup-opt is-on/);
});

test('the pair carries the ids and names the apply needs', () => {
  const h = pairHtml(pair(), 2);
  assert.match(h, /data-a="15"/);
  assert.match(h, /data-b="63"/);
  assert.match(h, /data-name-a="Maiana Pessoa"/);
  assert.match(h, /name="same-2"/);
});

test('the reason chips survived the redesign', () => {
  const h = pairHtml(pair(), 0);
  assert.match(h, /mesmo usuário, domínio diferente/);
  assert.match(h, /nome parecido/);
});

// ── the kept name is an editable field ───────────────────────────────────────────────
// Élder's round-1 ask, finally built: "sometimes you have a name that has more parts than the other
// one, but the more complete one is not in Pascal case, so I can quickly make it better and then just
// save that name. Same thing if there's a misspelling."
test('the kept name is a PREFILLED text field, not just a label', () => {
  const h = pairHtml(pair({ suggestion: 'keep_a' }), 0);
  assert.match(h, /class="cdx-dup-name-in"/);
  assert.match(h, /type="text"/);
  assert.match(h, /value="Maiana Pessoa"/);   // prefilled, so it reads as changeable
});

test('the field is prefilled from the SUGGESTED survivor, whichever side that is', () => {
  assert.match(pairHtml(pair({ suggestion: 'keep_b' }), 0), /class="cdx-dup-name-in"[^>]*value="Maiana Alves Pessoa"/);
  assert.match(pairHtml(pair({ suggestion: 'keep_a' }), 0), /class="cdx-dup-name-in"[^>]*value="Maiana Pessoa"/);
});

test('the field has its own id and a label pointing at it', () => {
  const h = pairHtml(pair(), 3);
  assert.match(h, /id="dup-name-3"/);
  assert.match(h, /for="dup-name-3"/);
  assert.match(h, /Nome final/);
});

test('a name with quotes cannot break out of the value attribute', () => {
  const p = pair();
  p.a.name = 'Maiana "A" Pessoa';
  const h = pairHtml(p, 0);
  assert.doesNotMatch(h, /value="Maiana "A" Pessoa"/);
  assert.match(h, /&quot;A&quot;/);
});
