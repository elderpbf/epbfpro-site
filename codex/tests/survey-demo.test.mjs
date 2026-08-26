// codex/tests/survey-demo.test.mjs
// Guards the pure seams of the track-64 look-and-feel prototype. The point of these is the
// OFF switch: this module ships on a branch and must stay completely inert on any URL that
// does not explicitly ask for a variant.
import test from 'node:test';
import assert from 'node:assert/strict';
import { variantFrom, isAnswered, answeredCount } from '../trilha/js/survey-demo.js';

test('variantFrom: reads the variant out of the query string', () => {
  assert.equal(variantFrom('?survey=1'), 1);
  assert.equal(variantFrom('?survey=4'), 4);
  assert.equal(variantFrom('?et=abc&survey=2'), 2);
  assert.equal(variantFrom('?survey=3&k=xyz'), 3);
});

test('variantFrom: anything that is not 1..4 reads as OFF', () => {
  assert.equal(variantFrom('?survey=0'), 0);
  assert.equal(variantFrom('?survey=5'), 0);
  assert.equal(variantFrom('?survey=x'), 0);
  assert.equal(variantFrom('?surveyed=1'), 0, 'a longer param name must not match');
  assert.equal(variantFrom(''), 0);
  assert.equal(variantFrom(null), 0);
  assert.equal(variantFrom(undefined), 0);
});

test('isAnswered: blank values never count', () => {
  assert.equal(isAnswered({}, 0), false);
  assert.equal(isAnswered({ 0: '' }, 0), false);
  assert.equal(isAnswered({ 0: '   ' }, 0), false);
  assert.equal(isAnswered({ 0: '3' }, 0), true);
});

test('isAnswered: a words item needs at least one non-blank box', () => {
  assert.equal(isAnswered({ 8: ['', '', ''] }, 8), false);
  assert.equal(isAnswered({ 8: ['  ', '', ''] }, 8), false);
  assert.equal(isAnswered({ 8: ['', 'clareza', ''] }, 8), true);
});

test('answeredCount: counts across the whole instrument, never above its size', () => {
  assert.equal(answeredCount({}), 0);
  assert.equal(answeredCount({ 0: '4', 1: '5' }), 2);
  assert.equal(answeredCount({ 0: '4', 1: '', 9: 'texto' }), 2);
  const all = {};
  for (let i = 0; i < 10; i++) all[i] = 'x';
  assert.equal(answeredCount(all), 10);
  all[99] = 'stray';
  assert.equal(answeredCount(all), 10, 'a key outside the instrument must not inflate the count');
});
