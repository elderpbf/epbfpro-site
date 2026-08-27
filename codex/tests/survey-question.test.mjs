// codex/tests/survey-question.test.mjs
// The shared survey question seam (js/survey-question.js). It is shared because the student's
// dialog and the admin's instrument preview must render the same card, so these guard the rules
// BOTH consumers depend on: what counts as answered, what the progress bar measures, and the
// one-word-per-box behaviour. The instrument is a fixture here on purpose: this module never owns
// the item list, the caller does.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAnswered, requiredTotal, answeredCount, progressPct, nextUnanswered, spillWords,
  isSelfAdvancing, questionCard, questionInput, progressLabel, WORD_SLOTS,
} from '../js/survey-question.js';

// Eight required, two optional, matching the agreed instrument's shape.
const ITEMS = [
  { kind: 'scale', prompt: 'q1' },
  { kind: 'scale', prompt: 'q2' },
  { kind: 'choice', prompt: 'q3', options: ['a', 'b'] },
  { kind: 'scale', prompt: 'q4' },
  { kind: 'scale', prompt: 'q5' },
  { kind: 'scale', prompt: 'q6' },
  { kind: 'scale', prompt: 'q7' },
  { kind: 'scale', prompt: 'q8' },
  { kind: 'words', prompt: 'q9', optional: true },
  { kind: 'text', prompt: 'q10', optional: true },
];
const ALL_REQUIRED = { 0: '4', 1: '4', 2: 'a', 3: '5', 4: '5', 5: '4', 6: '3', 7: '5' };
// The dictionary is INJECTED, never imported: the trail and the admin app carry separate ones.
const t = (k) => k;

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
  assert.equal(requiredTotal(ITEMS), 8);
  assert.equal(answeredCount(ITEMS, {}), 0);
  assert.equal(answeredCount(ITEMS, { 0: '4', 1: '5' }), 2);
  assert.equal(answeredCount(ITEMS, { 8: ['boa'], 9: 'texto' }), 0, 'optional answers do not advance it');
});

test('the bar reaches 100% with both optional items left blank', () => {
  assert.equal(progressPct(ITEMS, ALL_REQUIRED), 100, 'this is the 8-de-10 complaint');
  assert.equal(progressPct(ITEMS, {}), 0);
  assert.equal(progressPct(ITEMS, { 0: '4', 1: '4', 2: 'a', 3: '4' }), 50);
});

test('progress never overfills, whatever lands in the answer map', () => {
  const noisy = Object.assign({}, ALL_REQUIRED, { 8: ['a', 'b', 'c'], 9: 'muito bom', 99: 'stray' });
  assert.equal(answeredCount(ITEMS, noisy), 8);
  assert.equal(progressPct(ITEMS, noisy), 100);
});

test('progress survives an empty or all-optional instrument instead of dividing by zero', () => {
  assert.equal(progressPct([], {}), 100);
  assert.equal(progressPct([{ kind: 'text', optional: true }], {}), 100);
});

test('nextUnanswered: finds the next gap, and reports when there is none', () => {
  assert.equal(nextUnanswered(ITEMS, {}, 0), 1);
  assert.equal(nextUnanswered(ITEMS, { 1: '4', 2: 'a' }, 0), 3, 'skips the ones already answered');
  assert.equal(nextUnanswered(ITEMS, { 8: ['a'], 9: 'y' }, 7), -1);
  assert.equal(nextUnanswered(ITEMS, {}, 9), -1, 'nothing after the last item');
});

test('only a one-tap kind may self-advance', () => {
  assert.equal(isSelfAdvancing({ kind: 'scale' }), true);
  assert.equal(isSelfAdvancing({ kind: 'choice' }), true);
  assert.equal(isSelfAdvancing({ kind: 'words' }), false, 'a box that runs away mid-word is worse');
  assert.equal(isSelfAdvancing({ kind: 'text' }), false);
  assert.equal(isSelfAdvancing(null), false);
});

test('spillWords: a second word moves to the next box instead of becoming a fake word', () => {
  assert.deepEqual(spillWords(['', '', ''], 0, 'clareza'), { words: ['clareza', '', ''], focus: 0 });
  assert.deepEqual(spillWords(['', '', ''], 0, 'muita clareza'), { words: ['muita', 'clareza', ''], focus: 2 });
  assert.deepEqual(spillWords(['', '', ''], 0, 'muita clareza mesmo'),
    { words: ['muita', 'clareza', 'mesmo'], focus: 2 }, 'a pasted phrase fills all three');
});

test('spillWords: a trailing space advances the caret, like a code field', () => {
  assert.deepEqual(spillWords(['', '', ''], 0, 'clareza '), { words: ['clareza', '', ''], focus: 1 });
  assert.deepEqual(spillWords(['a', '', ''], 1, 'b '), { words: ['a', 'b', ''], focus: 2 });
  assert.deepEqual(spillWords(['a', 'b', ''], 2, 'c '), { words: ['a', 'b', 'c'], focus: 2 },
    'the last box has nowhere to advance to');
});

test('spillWords: never overflows the boxes, and clearing one clears it', () => {
  assert.equal(WORD_SLOTS, 3);
  assert.deepEqual(spillWords(['', '', ''], 1, 'um dois tres quatro').words, ['', 'um', 'dois']);
  assert.deepEqual(spillWords(['a', 'b', 'c'], 1, '').words, ['a', '', 'c']);
  assert.deepEqual(spillWords(['a', 'b', 'c'], 1, '   ').words, ['a', '', 'c']);
  assert.deepEqual(spillWords(null, 0, 'x').words, ['x', '', '']);
  assert.deepEqual(spillWords(undefined, 0, null).words, ['', '', '']);
});

test('questionCard: renders the hooks the consumers bind to, and escapes the prompt', () => {
  const html = questionCard(ITEMS[0], 0, {}, t, { total: 10 });
  assert.match(html, /data-sv-q="0"/);
  assert.match(html, /data-sv-set="0"/, 'the click hook the shell delegates on');
  assert.match(html, /1<span>\/10<\/span>/, 'the position counter divides by the given total');
  const nasty = questionCard({ kind: 'text', prompt: '<img onerror=x>' }, 0, {}, t, {});
  assert.ok(!nasty.includes('<img'), 'a prompt is escaped, never injected');
});

test('questionCard: an optional item is badged, a required one is not', () => {
  assert.match(questionCard(ITEMS[8], 8, {}, t, {}), /cdx-sv-opt/);
  assert.ok(!questionCard(ITEMS[0], 0, {}, t, {}).includes('cdx-sv-opt'));
});

test('questionCard: an answered card carries is-done, which is what patching toggles', () => {
  assert.match(questionCard(ITEMS[0], 0, { 0: '4' }, t, {}), /cdx-sv-q is-done/);
  assert.ok(!questionCard(ITEMS[0], 0, {}, t, {}).includes('is-done'));
});

test('questionInput: each kind renders its own control and nothing else', () => {
  assert.match(questionInput(ITEMS[0], 0, {}, t), /cdx-sv-scale/);
  assert.match(questionInput(ITEMS[2], 2, {}, t), /cdx-sv-choices/);
  assert.match(questionInput(ITEMS[8], 8, {}, t), /cdx-sv-words/);
  assert.match(questionInput(ITEMS[9], 9, {}, t), /cdx-sv-text/);
});

test('a scale honours per-question bounds, so config never comes from localStorage', () => {
  const html = questionInput({ kind: 'scale', prompt: 'x', min: 1, max: 10 }, 0, {}, t);
  assert.equal((html.match(/data-sv-val=/g) || []).length, 10);
  assert.equal((questionInput(ITEMS[0], 0, {}, t).match(/data-sv-val=/g) || []).length, 5, 'default 1..5');
});

test('progressLabel: fills both placeholders from the required total', () => {
  assert.equal(progressLabel(ITEMS, ALL_REQUIRED, () => '{n} de {total}'), '8 de 8');
  assert.equal(progressLabel(ITEMS, {}, () => '{n} de {total}'), '0 de 8');
});
