// tests/trilha-page.test.mjs
// Codex Trail · student-page frame. Unit-tests the DOM-free logic of the port:
// URL parsing, tab routing, and the date/status/topics helpers. The hero/tab DOM
// wiring is verified visually on staging.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLocation } from '../trilha/js/state.js';
import { resolveTab } from '../trilha/js/page.js';
import { fmtDate, aulaStatus, aulaDateText, parseTopics } from '../trilha/js/utils.js';

// ── parseLocation ───────────────────────────────────────────────────────────
test('parseLocation: query params c/t/k', () => {
  assert.deepEqual(parseLocation('?c=acme&t=turma1&k=tok', '/codex/trilha/'),
    { clientSlug: 'acme', turmaSlug: 'turma1', token: 'tok' });
});
test('parseLocation: clean path /trilha/<c>/<t>?k=', () => {
  assert.deepEqual(parseLocation('?k=tok', '/trilha/acme/turma1'),
    { clientSlug: 'acme', turmaSlug: 'turma1', token: 'tok' });
});
test('parseLocation: clean path tolerates a /codex/ prefix', () => {
  assert.deepEqual(parseLocation('?k=tok', '/codex/trilha/acme/turma1'),
    { clientSlug: 'acme', turmaSlug: 'turma1', token: 'tok' });
});
test('parseLocation: query wins over path', () => {
  assert.deepEqual(parseLocation('?c=q1&t=q2&k=tok', '/trilha/p1/p2'),
    { clientSlug: 'q1', turmaSlug: 'q2', token: 'tok' });
});
test('parseLocation: missing -> nulls', () => {
  assert.deepEqual(parseLocation('', '/trilha/'), { clientSlug: null, turmaSlug: null, token: null });
});

// ── resolveTab ──────────────────────────────────────────────────────────────
test('resolveTab: known hashes', () => {
  assert.equal(resolveTab('#aulas'), 'aulas');
  assert.equal(resolveTab('#apostila'), 'apostila');
  assert.equal(resolveTab('outros'), 'outros');
});
test('resolveTab: unknown/empty -> aulas', () => {
  assert.equal(resolveTab(''), 'aulas');
  assert.equal(resolveTab('#whatever'), 'aulas');
  assert.equal(resolveTab(null), 'aulas');
});

// ── fmtDate (d/m, no year) ──────────────────────────────────────────────────
test('fmtDate: d/m, leading zeros stripped, no year', () => {
  assert.equal(fmtDate('2026-01-07'), '7/1');
  assert.equal(fmtDate('2024-11-30'), '30/11');
  assert.equal(fmtDate(''), '');
});

// ── aulaStatus (deterministic via explicit today) ───────────────────────────
const TODAY = '2026-06-15';
test('aulaStatus: happened -> done', () => assert.equal(aulaStatus({ happened_on: '2026-06-10' }, TODAY), 'done'));
test('aulaStatus: future scheduled -> upcoming', () => assert.equal(aulaStatus({ scheduled_for: '2026-06-20' }, TODAY), 'upcoming'));
test('aulaStatus: past/today scheduled -> done', () => {
  assert.equal(aulaStatus({ scheduled_for: '2026-06-10' }, TODAY), 'done');
  assert.equal(aulaStatus({ scheduled_for: TODAY }, TODAY), 'done');
});
test('aulaStatus: nothing -> und', () => assert.equal(aulaStatus({}, TODAY), 'und'));

// ── aulaDateText ────────────────────────────────────────────────────────────
test('aulaDateText: happened', () => assert.equal(aulaDateText({ happened_on: '2026-06-10' }, TODAY), 'ocorreu em 10/6'));
test('aulaDateText: future scheduled', () => assert.equal(aulaDateText({ scheduled_for: '2026-06-20' }, TODAY), 'agendada para 20/6'));
test('aulaDateText: rescheduled to a future date', () =>
  assert.equal(aulaDateText({ rescheduled_from: '2026-06-01', scheduled_for: '2026-06-20' }, TODAY), 'remarcada (era 1/6, agora 20/6)'));
test('aulaDateText: nothing -> a definir', () => assert.equal(aulaDateText({}, TODAY), 'a definir'));

// ── parseTopics ─────────────────────────────────────────────────────────────
test('parseTopics: array trims + drops empties', () => assert.deepEqual(parseTopics(['a', ' b ', '']), ['a', 'b']));
test('parseTopics: JSON-array string', () => assert.deepEqual(parseTopics('["x","y"]'), ['x', 'y']));
test('parseTopics: CSV fallback', () => assert.deepEqual(parseTopics('a, b ,c'), ['a', 'b', 'c']));
test('parseTopics: empty -> []', () => assert.deepEqual(parseTopics(''), []));
