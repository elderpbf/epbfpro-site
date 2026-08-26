// codex/tests/survey-demo.test.mjs
// Guards the pure seams of the track-64 look-and-feel prototype: the OFF switch (this ships on a
// branch and must stay inert on any URL that does not ask for a version), and the counting rules
// behind the progress bar, which are the part Élder actually pushed back on.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  variantFrom, isAnswered, answeredCount, requiredTotal, progressPct, nextUnanswered, spillWords,
} from '../trilha/js/survey-demo.js';

// Indices 0..7 are required; 8 (three words) and 9 (free text) are optional.
const ALL_REQUIRED = { 0: '4', 1: '4', 2: 'Foi adequado', 3: '5', 4: '5', 5: '4', 6: '3', 7: '5' };

test('variantFrom: reads the version out of the query string', () => {
  assert.equal(variantFrom('?survey=1'), 1);
  assert.equal(variantFrom('?survey=2'), 2);
  assert.equal(variantFrom('?et=abc&survey=2'), 2);
  assert.equal(variantFrom('?survey=1&k=xyz'), 1);
});

test('variantFrom: anything that is not 1..2 reads as OFF', () => {
  assert.equal(variantFrom('?survey=0'), 0);
  assert.equal(variantFrom('?survey=3'), 0, 'the retired variants must not half-mount');
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

test('progress is measured against the REQUIRED items only', () => {
  assert.equal(requiredTotal(), 8);
  assert.equal(answeredCount({}), 0);
  assert.equal(answeredCount({ 0: '4', 1: '5' }), 2);
  assert.equal(answeredCount({ 8: ['boa'], 9: 'texto' }), 0, 'optional answers do not advance it');
});

test('the bar reaches 100% with both optional items left blank', () => {
  assert.equal(progressPct(ALL_REQUIRED), 100, 'this is the 8-de-10 complaint');
  assert.equal(progressPct({}), 0);
  assert.equal(progressPct({ 0: '4', 1: '4', 2: 'x', 3: '4' }), 50);
});

test('progress never overfills, whatever lands in the answer map', () => {
  const noisy = Object.assign({}, ALL_REQUIRED, { 8: ['a', 'b', 'c'], 9: 'muito bom', 99: 'stray' });
  assert.equal(answeredCount(noisy), 8);
  assert.equal(progressPct(noisy), 100);
});

test('nextUnanswered: finds the next gap, and reports when there is none', () => {
  assert.equal(nextUnanswered({}, 0), 1);
  assert.equal(nextUnanswered({ 1: '4', 2: 'x' }, 0), 3, 'skips the ones already answered');
  assert.equal(nextUnanswered({ 8: ['a'], 9: 'y' }, 7), -1, 'optional items still count as filled here');
  assert.equal(nextUnanswered({}, 9), -1, 'nothing after the last item');
});

test('spillWords: a second word moves to the next box instead of becoming a fake word', () => {
  assert.deepEqual(spillWords(['', '', ''], 0, 'clareza'), { words: ['clareza', '', ''], focus: 0 });
  assert.deepEqual(spillWords(['', '', ''], 0, 'muita clareza'), { words: ['muita', 'clareza', ''], focus: 2 });
  assert.deepEqual(spillWords(['', '', ''], 0, 'muita clareza mesmo'),
    { words: ['muita', 'clareza', 'mesmo'], focus: 2 }, 'a pasted phrase fills all three');
});

test('spillWords: a trailing space advances the caret, like an OTP field', () => {
  assert.deepEqual(spillWords(['', '', ''], 0, 'clareza '), { words: ['clareza', '', ''], focus: 1 });
  assert.deepEqual(spillWords(['a', '', ''], 1, 'b '), { words: ['a', 'b', ''], focus: 2 });
  assert.deepEqual(spillWords(['a', 'b', ''], 2, 'c '), { words: ['a', 'b', 'c'], focus: 2 },
    'the last box has nowhere to advance to');
});

test('spillWords: never overflows three boxes, and clearing a box clears it', () => {
  assert.deepEqual(spillWords(['', '', ''], 1, 'um dois tres quatro').words, ['', 'um', 'dois']);
  assert.deepEqual(spillWords(['a', 'b', 'c'], 1, '').words, ['a', '', 'c']);
  assert.deepEqual(spillWords(['a', 'b', 'c'], 1, '   ').words, ['a', '', 'c']);
  assert.deepEqual(spillWords(null, 0, 'x').words, ['x', '', '']);
  assert.deepEqual(spillWords(undefined, 0, null).words, ['', '', '']);
});
