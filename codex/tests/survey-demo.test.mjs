// codex/tests/survey-demo.test.mjs
// The student shell's OFF switch and its mode parsing. The shell owns no rendering (that is
// js/survey-question.js, guarded by survey-question.test.mjs); what it owns is the decision of
// WHETHER to mount at all, and the two independent axes it mounts with.
import test from 'node:test';
import assert from 'node:assert/strict';
import { modeFrom, modeNumber } from '../trilha/js/survey-demo.js';

test('modeFrom: the prototype is OFF unless the URL asks for it', () => {
  assert.equal(modeFrom(''), null);
  assert.equal(modeFrom(null), null);
  assert.equal(modeFrom(undefined), null);
  assert.equal(modeFrom('?k=abc'), null);
  assert.equal(modeFrom('?survey=0'), null);
  assert.equal(modeFrom('?survey=5'), null);
  assert.equal(modeFrom('?survey=x'), null);
  assert.equal(modeFrom('?surveyed=1'), null, 'a longer param name must not match');
});

test('modeFrom: one digit carries BOTH axes', () => {
  assert.deepEqual(modeFrom('?survey=1'), { n: 1, presentation: 'dialog', pace: 'all' });
  assert.deepEqual(modeFrom('?survey=2'), { n: 2, presentation: 'dialog', pace: 'steps' });
  assert.deepEqual(modeFrom('?survey=3'), { n: 3, presentation: 'full', pace: 'all' });
  assert.deepEqual(modeFrom('?survey=4'), { n: 4, presentation: 'full', pace: 'steps' });
});

test('modeFrom: reads the param wherever it sits in the query string', () => {
  assert.equal(modeFrom('?et=abc&survey=3').presentation, 'full');
  assert.equal(modeFrom('?survey=2&k=xyz').pace, 'steps');
});

test('modeNumber: round-trips, so a switcher link changes ONE axis and leaves the other', () => {
  for (let n = 1; n <= 4; n++) {
    const m = modeFrom('?survey=' + n);
    assert.equal(modeNumber(m.presentation, m.pace), n, 'round-trip for ' + n);
  }
  // Flipping presentation on "dialog + steps" must keep the pace.
  const cur = modeFrom('?survey=2');
  const flipped = modeFrom('?survey=' + modeNumber('full', cur.pace));
  assert.equal(flipped.pace, 'steps', 'the untouched axis survives the flip');
  assert.equal(flipped.presentation, 'full');
  // Flipping pace on "full + all" must keep the presentation.
  const cur2 = modeFrom('?survey=3');
  const flipped2 = modeFrom('?survey=' + modeNumber(cur2.presentation, 'steps'));
  assert.equal(flipped2.presentation, 'full');
  assert.equal(flipped2.pace, 'steps');
});

test('modeNumber: an unknown axis value falls back rather than producing a dead link', () => {
  assert.equal(modeNumber('nonsense', 'all'), 1);
  assert.equal(modeNumber('dialog', 'nonsense'), 1);
});
