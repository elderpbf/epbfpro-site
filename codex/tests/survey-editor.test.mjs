// codex/tests/survey-editor.test.mjs
// Editing the instrument (cohorts/survey-editor.js). track-64 §3.10 allows edits after answers
// exist and RECONCILES rather than blocks, and every rule that makes that safe is about the row's
// ID: a question keeps its id through a reorder and a rewording, and LOSES it when it becomes a
// different question. An id silently dropped re-keys a question and orphans its answers, which
// nothing on screen would announce.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KINDS, move, add, remove, setKind, setField, setOption, addOption, removeOption,
  validationError, toPayload,
} from '../cohorts/survey-editor.js';

const ROWS = () => ([
  { id: 1, kind: 'rating', prompt: 'a', required: 1 },
  { id: 2, kind: 'poll', prompt: 'b', required: 1, options: ['x', 'y'] },
  { id: 3, kind: 'open', prompt: 'c', required: 0 },
]);

test('reordering carries the ID, so answers stay attached to their question', () => {
  const moved = move(ROWS(), 0, 1);
  assert.deepEqual(moved.map((r) => r.id), [2, 1, 3]);
  assert.equal(moved[1].prompt, 'a');
  assert.deepEqual(move(ROWS(), 2, -2).map((r) => r.id), [3, 1, 2]);
});

test('a move off either end is a no-op, not a wrap and not a hole', () => {
  assert.deepEqual(move(ROWS(), 0, -1).map((r) => r.id), [1, 2, 3]);
  assert.deepEqual(move(ROWS(), 2, 1).map((r) => r.id), [1, 2, 3]);
  assert.deepEqual(move(ROWS(), 9, 1).map((r) => r.id), [1, 2, 3]);
  assert.equal(move([], 0, 1).length, 0);
});

test('every mutation returns a NEW array, so cancel really cancels', () => {
  const src = ROWS();
  const before = JSON.stringify(src);
  move(src, 0, 1); add(src, 'rating'); remove(src, 0); setKind(src, 0, 'poll');
  setField(src, 0, 'prompt', 'z'); setOption(src, 1, 0, 'q'); addOption(src, 1); removeOption(src, 1, 0);
  assert.equal(JSON.stringify(src), before, 'the draft the caller holds was mutated in place');
});

test('a new question carries NO id: the Worker inserts it, nothing invents a key', () => {
  const out = add(ROWS(), 'rating');
  assert.equal(out.length, 4);
  assert.equal(out[3].id, undefined);
  assert.equal(out[3].required, 1);
  assert.deepEqual(add([], 'poll')[0].options, ['', ''], 'a choice is born with two slots to fill');
  assert.equal(add([], 'nonsense')[0].kind, 'rating', 'an unknown kind falls back rather than storing itself');
});

test('changing the KIND drops the id, because that is a different question (§3.10)', () => {
  const out = setKind(ROWS(), 0, 'open');
  assert.equal(out[0].kind, 'open');
  assert.equal(out[0].id, undefined, 'the old row archives and this one is born');
  assert.equal(out[0].prompt, 'a', 'the wording is carried across so he does not retype it');
  assert.equal(out[1].id, 2, 'and no other row is touched');
});

test('setting the SAME kind changes nothing, so a stray change event cannot orphan answers', () => {
  const out = setKind(ROWS(), 0, 'rating');
  assert.equal(out[0].id, 1);
  assert.equal(setKind(ROWS(), 0, 'nps')[0].id, 1, 'and an unknown kind is refused outright');
});

test('becoming a poll arrives with two option slots, keeping any it already had', () => {
  assert.deepEqual(setKind(ROWS(), 0, 'poll')[0].options, ['', '']);
  const withOpts = [{ id: 9, kind: 'open', prompt: 'x', required: 1, options: ['p', 'q', 'r'] }];
  assert.deepEqual(setKind(withOpts, 0, 'poll')[0].options, ['p', 'q', 'r']);
});

test('rewording and required-ness are FREE: the id survives', () => {
  const out = setField(ROWS(), 0, 'prompt', 'reescrita');
  assert.equal(out[0].id, 1);
  assert.equal(out[0].prompt, 'reescrita');
  assert.equal(setField(ROWS(), 2, 'required', 1)[2].id, 3);
  assert.deepEqual(setField(ROWS(), 99, 'prompt', 'x').map((r) => r.id), [1, 2, 3]);
});

test('options: set, add, and a floor of two so a choice stays a choice', () => {
  assert.deepEqual(setOption(ROWS(), 1, 1, 'novo')[1].options, ['x', 'novo']);
  assert.deepEqual(setOption(ROWS(), 1, 3, 'q')[1].options, ['x', 'y', '', 'q'], 'a gap fills rather than throws');
  assert.deepEqual(addOption(ROWS(), 1)[1].options, ['x', 'y', '']);
  assert.deepEqual(removeOption(ROWS(), 1, 0)[1].options, ['x', 'y'], 'two is the floor');
  const three = addOption(ROWS(), 1);
  assert.deepEqual(removeOption(three, 1, 0)[1].options, ['y', '']);
});

test('removing a question drops it from the list SENT, which the Worker turns into archived', () => {
  assert.deepEqual(remove(ROWS(), 1).map((r) => r.id), [1, 3]);
  assert.deepEqual(remove(ROWS(), 9).map((r) => r.id), [1, 2, 3]);
});

test('validationError names what is wrong, in the Worker own vocabulary', () => {
  assert.equal(validationError(ROWS()), null);
  assert.equal(validationError([]), 'no_instrument');
  assert.equal(validationError(null), 'no_instrument');
  assert.equal(validationError([{ kind: 'nps', prompt: 'x', required: 1 }]), 'bad_kind');
  assert.equal(validationError([{ kind: 'rating', prompt: '   ', required: 1 }]), 'empty_prompt');
  assert.equal(validationError([{ kind: 'poll', prompt: 'x', required: 1, options: ['a', '  '] }]),
    'poll_needs_options', 'a blank line is not an option');
});

test('an instrument nobody has to answer is refused: it would sit at 100% before the first tap', () => {
  assert.equal(validationError([{ kind: 'open', prompt: 'x', required: 0 }]), 'nothing_required');
  assert.equal(validationError(ROWS().map((r) => Object.assign({}, r, { required: 0 }))), 'nothing_required');
});

test('toPayload sends the id only when there is one, and derives position from the ORDER', () => {
  const out = toPayload(add(ROWS(), 'rating'));
  assert.deepEqual(out.map((r) => r.id), [1, 2, 3, undefined]);
  assert.ok(!('position' in out[0]), 'position is derived by the Worker from this array order');
  assert.equal(out[0].required, 1);
  assert.equal(out[2].required, 0);
});

test('toPayload trims, and drops the blank option lines rather than storing them', () => {
  const rows = [{ id: 1, kind: 'poll', prompt: '  x  ', required: 1, options: ['a', '', ' b ', '   '] }];
  const out = toPayload(rows);
  assert.equal(out[0].prompt, 'x');
  assert.deepEqual(out[0].options, ['a', 'b']);
  assert.ok(!('options' in toPayload(ROWS())[0]), 'a non-poll sends no options at all');
});

test('KINDS is the same four the stored vocabulary uses', () => {
  assert.deepEqual(KINDS, ['rating', 'poll', 'wordcloud', 'open']);
});
