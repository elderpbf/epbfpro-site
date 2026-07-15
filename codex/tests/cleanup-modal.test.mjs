// cohorts/cleanup-modal.js — the "Limpeza" tool (Élder 2026-07-15: "let's change the duplication
// name to cleanup, so the duplications stay the same and you can add a list of possible test
// registrations for deletion").
//
// What these pin is the SAFETY of the destructive half, not a snapshot: nothing pre-selected, the
// reasons always visible, and the counter covering both sections.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanupButtonHtml, testRowHtml } from '../cohorts/cleanup-modal.js';

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
