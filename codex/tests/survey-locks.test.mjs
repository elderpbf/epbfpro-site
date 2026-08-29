// codex/tests/survey-locks.test.mjs
// The five conditions of track-64 §3.7b. This is the highest-consequence logic in
// the feature: read one way it greys the admin's send button, read the other it
// covers a student's trail with a wall. Élder's words when he chose the gate were
// "you must be completely sure that this does not happen before all classes are over
// and before I tell you to launch the questionnaire, otherwise this will make people
// become stuck", so the fail-open cases below are the point of the file, not padding.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isMarkedHappened, aulasPending, liveQuestions, isClosed, daysLeft,
  sendBlocks, canSend, gateBlocks, shouldGate, SEND_BLOCKS, GATE_BLOCKS,
} from '../js/survey-locks.js';

const NOW = 1_780_000_000;
const DAY = 86400;
const AULAS = (marked) => [1, 2, 3, 4].map((n) => ({ aula_number: n, happened_on: n <= marked ? '2026-08-0' + n : null }));
const QUESTIONS = [{ id: 1, kind: 'rating' }, { id: 2, kind: 'open' }];

// Everything holds: this is the one state that both sends AND gates.
const READY = {
  status: 'open', sent_at: NOW - DAY, closes_at: NOW + 6 * DAY, now: NOW,
  questions: QUESTIONS, invitees: 14, aulas: AULAS(4), answered: false,
};
const DRAFT_READY = Object.assign({}, READY, { status: 'draft', sent_at: null, closes_at: null });

const codes = (list) => list.map((b) => b.code);

test('the mark is the predicate, not the calendar', () => {
  assert.equal(isMarkedHappened({ happened_on: '2026-08-01' }), true);
  assert.equal(isMarkedHappened({ scheduled_for: '2020-01-01' }), false,
    'a long-past scheduled date is NOT a confirmation; js/aula-status.js answers a different question');
  assert.equal(isMarkedHappened({}), false);
  assert.equal(isMarkedHappened(null), false);
});

test('aulasPending lists the unmarked numbers, ascending, and distinguishes UNKNOWN from none', () => {
  assert.deepEqual(aulasPending(AULAS(4)), []);
  assert.deepEqual(aulasPending(AULAS(2)), [3, 4]);
  assert.deepEqual(aulasPending([{ aula_number: 4 }, { aula_number: 1 }]), [1, 4], 'sorted, not in list order');
  assert.equal(aulasPending(undefined), null, 'no list is not an empty list');
  assert.equal(aulasPending(null), null);
});

test('an archived question is version history, not instrument', () => {
  assert.equal(liveQuestions([{ id: 1 }, { id: 2, archived: 1 }]).length, 1);
  assert.equal(liveQuestions(null).length, 0);
});

test('isClosed reads the status OR the clock', () => {
  assert.equal(isClosed(READY), false);
  assert.equal(isClosed(Object.assign({}, READY, { status: 'closed' })), true);
  assert.equal(isClosed(Object.assign({}, READY, { closes_at: NOW - 1 })), true);
  assert.equal(isClosed(Object.assign({}, READY, { closes_at: NOW })), true, 'the boundary closes');
  assert.equal(isClosed({}), false, 'a draft with no window is not closed');
});

test('daysLeft floors and never goes negative', () => {
  assert.equal(daysLeft(READY), 6);
  assert.equal(daysLeft(Object.assign({}, READY, { closes_at: NOW + DAY + 3600 })), 1);
  assert.equal(daysLeft(Object.assign({}, READY, { closes_at: NOW - 5 * DAY })), 0);
  assert.equal(daysLeft({}), 0);
});

// ── The SEND side: every lock has to be nameable ────────────────────────────────

test('a ready draft sends, and nothing blocks it', () => {
  assert.deepEqual(sendBlocks(DRAFT_READY), []);
  assert.equal(canSend(DRAFT_READY), true);
});

test('each send lock reports its own code, and they accumulate', () => {
  assert.deepEqual(codes(sendBlocks(Object.assign({}, DRAFT_READY, { questions: [] }))), ['no_instrument']);
  assert.deepEqual(codes(sendBlocks(Object.assign({}, DRAFT_READY, { invitees: 0 }))), ['no_invitees']);
  assert.deepEqual(codes(sendBlocks(Object.assign({}, DRAFT_READY, { sent_at: NOW }))), ['already_sent']);
  assert.deepEqual(codes(sendBlocks(Object.assign({}, DRAFT_READY, { status: 'closed' }))), ['closed']);
  const empty = sendBlocks({ now: NOW });
  assert.deepEqual(codes(empty), ['no_instrument', 'no_invitees', 'aulas_pending'],
    'an empty state names every lock it can prove, not just the first');
});

test('the aulas lock carries WHICH ones, which is the whole diagnosis', () => {
  const blocks = sendBlocks(Object.assign({}, DRAFT_READY, { aulas: AULAS(2) }));
  assert.deepEqual(codes(blocks), ['aulas_pending']);
  assert.deepEqual(blocks[0].aulas, [3, 4]);
  assert.equal(canSend(Object.assign({}, DRAFT_READY, { aulas: AULAS(3) })), false, 'one unmarked aula is enough');
});

test('an unknown aula list BLOCKS the send, with an empty list to say so', () => {
  const blocks = sendBlocks(Object.assign({}, DRAFT_READY, { aulas: undefined }));
  assert.deepEqual(codes(blocks), ['aulas_pending']);
  assert.deepEqual(blocks[0].aulas, [], 'nothing to name, but still a lock: the admin must not send on an unproven state');
});

test('every declared SEND_BLOCKS code is actually reachable', () => {
  const seen = new Set();
  [
    Object.assign({}, DRAFT_READY, { questions: [] }),
    Object.assign({}, DRAFT_READY, { invitees: 0 }),
    Object.assign({}, DRAFT_READY, { aulas: AULAS(1) }),
    Object.assign({}, DRAFT_READY, { sent_at: NOW }),
    Object.assign({}, DRAFT_READY, { status: 'closed' }),
  ].forEach((s) => codes(sendBlocks(s)).forEach((c) => seen.add(c)));
  assert.deepEqual([...seen].sort(), [...SEND_BLOCKS].sort(),
    'a code nothing can produce is a lock the admin will never see explained');
});

// ── The GATE side: the same conditions, and the fail-open rule ──────────────────

test('the gate holds only when every condition does', () => {
  assert.deepEqual(gateBlocks(READY), []);
  assert.equal(shouldGate(READY), true);
});

test('each gate condition, alone, lets the trail through', () => {
  assert.equal(shouldGate(Object.assign({}, READY, { status: 'draft' })), false, 'a draft never gates');
  assert.equal(shouldGate(Object.assign({}, READY, { sent_at: null })), false, 'nothing reaches a student before he presses send');
  assert.equal(shouldGate(Object.assign({}, READY, { closes_at: NOW - 1 })), false, 'the gate cannot outlive its window');
  assert.equal(shouldGate(Object.assign({}, READY, { answered: true })), false, 'answering ends it permanently');
  assert.equal(shouldGate(Object.assign({}, READY, { aulas: AULAS(3) })), false, 'one unmarked aula, no gate');
});

test('every declared GATE_BLOCKS code is actually reachable', () => {
  const seen = new Set();
  [
    Object.assign({}, READY, { status: 'draft' }),
    Object.assign({}, READY, { sent_at: null }),
    Object.assign({}, READY, { closes_at: NOW - 1 }),
    Object.assign({}, READY, { answered: true }),
    Object.assign({}, READY, { aulas: AULAS(0) }),
  ].forEach((s) => codes(gateBlocks(s)).forEach((c) => seen.add(c)));
  assert.deepEqual([...seen].sort(), [...GATE_BLOCKS].sort());
});

test('FAIL OPEN: anything short of a complete, legible state renders the trail', () => {
  assert.equal(shouldGate(null), false);
  assert.equal(shouldGate(undefined), false);
  assert.equal(shouldGate('open'), false, 'a string is not a state');
  assert.equal(shouldGate(42), false);
  assert.equal(shouldGate({}), false);
  assert.equal(shouldGate(Object.assign({}, READY, { now: 0 })), false, 'without a clock nothing about the window is provable');
  assert.equal(shouldGate(Object.assign({}, READY, { now: undefined })), false);
  assert.equal(shouldGate(Object.assign({}, READY, { aulas: undefined })), false,
    'a truncated response must not read as "every aula happened"');
  assert.equal(shouldGate(Object.assign({}, READY, { aulas: null })), false);
  assert.equal(shouldGate(Object.assign({}, READY, { closes_at: null })), false,
    'an open survey with no deadline would gate forever');
});

test('the two sides disagree about an UNKNOWN aula list, on purpose', () => {
  const unknown = Object.assign({}, READY, { aulas: undefined });
  assert.equal(shouldGate(unknown), false, 'the student is never gated on a guess');
  assert.equal(canSend(Object.assign({}, DRAFT_READY, { aulas: undefined })), false, 'and the admin is never allowed to send on one');
});
