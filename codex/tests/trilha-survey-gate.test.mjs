// codex/tests/trilha-survey-gate.test.mjs
// The student gate's own seams (trilha/js/survey.js). The rendering is the shared question module
// and is tested there; what belongs here is the pace override and the two mappings between the
// renderer's world and the database's, because an index quietly sent where a question_id was
// expected writes every answer against the wrong question and nothing throws.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
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

// ── WHEN the gate starts, which is the bug that hid behind every green run ────
// It used to call start() at module scope, imported for its side effect from trilha/index.html.
// That runs BEFORE page.js reads the session out of localStorage, so state.sessionToken was null,
// the first line of start() returned "nobody is logged in", and the gate appeared for nobody. Every
// test that passed was exercising the fail-open path, which is exactly what makes it invisible.
// Found by logging in as a real seeded student on staging and watching nothing happen.

test('survey.js does NOT start itself: importing it must not decide anything', () => {
  const js = fs.readFileSync(fileURLToPath(new URL('../trilha/js/survey.js', import.meta.url)), 'utf8');
  // Strip line comments before looking, or this file's own prose about `start();` would pass
  // for the thing it is banning.
  const code = js.replace(/^[ 	]*\/\/.*$/gm, '');
  assert.ok(!/^start\(\);?[ 	]*$/m.test(code), 'a self-start runs before the session is read');
});

test('page.js starts it AFTER the session is read and only over a rendered trail', () => {
  const js = fs.readFileSync(fileURLToPath(new URL('../trilha/js/page.js', import.meta.url)), 'utf8');
  assert.match(js, /startSurvey\(\)/, 'the trail boot is what knows the session exists');
  const call = js.slice(js.indexOf('startSurvey()') - 200, js.indexOf('startSurvey()') + 20);
  assert.match(call, /state[.]sessionToken/, 'no session, nobody to gate');
  assert.match(call, /isWall/, 'a student on the approval wall cannot open the course being asked about');
  assert.ok(js.indexOf('state.sessionToken =') < js.indexOf('startSurvey()'),
    'the session must be read before the gate asks for it');
});
