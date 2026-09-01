// codex/tests/trilha-survey-gate.test.mjs
// The student gate's own seams (trilha/js/survey.js). The rendering is the shared question module
// and is tested there; what belongs here is the pace override and the two mappings between the
// renderer's world and the database's, because an index quietly sent where a question_id was
// expected writes every answer against the wrong question and nothing throws.
import test from 'node:test';
import assert from 'node:assert/strict';
import { paceFrom, itemsFromRows, answersByQuestionId } from '../trilha/js/survey.js';

const ROWS = [
  { id: 11, kind: 'rating', prompt: 'q1', required: 1 },
  { id: 12, kind: 'poll', prompt: 'q2', required: 1, options: ['a', 'b'] },
  { id: 13, kind: 'wordcloud', prompt: 'q3', required: 0 },
  { id: 14, kind: 'open', prompt: 'q4', required: 0 },
];

test('the pace is a code-level default, and only ?survey=steps moves it', () => {
  assert.equal(paceFrom(''), 'all');
  assert.equal(paceFrom(null), 'all');
  assert.equal(paceFrom('?survey=steps'), 'steps');
  assert.equal(paceFrom('?a=1&survey=steps'), 'steps');
  assert.equal(paceFrom('?survey=1'), 'all', 'the prototype numbers no longer mean anything');
  assert.equal(paceFrom('?survey=stepsish'), 'all');
});

test('itemsFromRows maps the stored vocabulary and keeps the id the answer travels under', () => {
  const items = itemsFromRows(ROWS);
  assert.equal(items.length, 4);
  assert.deepEqual(items.map((i) => i.kind), ['scale', 'choice', 'words', 'text']);
  assert.deepEqual(items.map((i) => i.id), [11, 12, 13, 14]);
  assert.deepEqual(items.map((i) => i.optional), [false, false, true, true]);
  assert.deepEqual(items[1].options, ['a', 'b']);
});

test('a row this build cannot render is SKIPPED, not thrown: an odd kind must not raise a wall', () => {
  const items = itemsFromRows([{ id: 1, kind: 'nps', prompt: 'x', required: 1 }, ROWS[0]]);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 11);
  assert.deepEqual(itemsFromRows(null), []);
});

test('answers travel by QUESTION ID, never by the index the renderer uses', () => {
  const items = itemsFromRows(ROWS);
  const out = answersByQuestionId(items, { 0: '5', 1: 'a', 2: ['clareza', '', ''], 3: 'muito bom' });
  assert.deepEqual(out, { 11: '5', 12: 'a', 13: ['clareza', '', ''], 14: 'muito bom' });
});

test('a blank answer is not sent at all, so it never becomes a stored empty row', () => {
  const items = itemsFromRows(ROWS);
  assert.deepEqual(answersByQuestionId(items, { 0: '', 1: '   ', 2: ['', '', ''], 3: null }), {});
  assert.deepEqual(answersByQuestionId(items, {}), {});
  assert.deepEqual(answersByQuestionId(items, { 0: '4' }), { 11: '4' });
});

test('an item with no id is dropped rather than sent under undefined', () => {
  assert.deepEqual(answersByQuestionId([{ kind: 'scale' }], { 0: '4' }), {});
});
