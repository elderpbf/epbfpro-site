// Word-level diff used by the apostila working-copy preview to mark ONLY the edited runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffWords, markChanges, stripMarks, DIFF_OPEN, DIFF_CLOSE } from '../js/text-diff.js';

const show = (s) => s.split(DIFF_OPEN).join('[').split(DIFF_CLOSE).join(']');

test('marks only the changed word, not the whole field', () => {
  assert.equal(show(markChanges('o corpo antigo aqui', 'o corpo NOVO aqui')), 'o corpo [NOVO] aqui');
});

test('all-new text is fully marked (new section)', () => {
  assert.equal(show(markChanges('', 'seção nova')), '[seção nova]');
});

test('identical text carries no marks', () => {
  assert.equal(markChanges('igual igual', 'igual igual'), 'igual igual');
  assert.equal(markChanges('', ''), '');
});

test('a trailing insertion marks only the inserted run', () => {
  assert.equal(show(markChanges('a b', 'a b c')), 'a b[ c]');
});

test('stripMarks removes the sentinels', () => {
  assert.equal(stripMarks(markChanges('', 'x y')), 'x y');
});

// ── diffWords (feeds the rendered-DOM body highlighter) ──────────────────────
const joinSegs = (segs) => segs.map((s) => s.text).join('');

test('diffWords reconstructs the new string exactly (incl. markdown syntax)', () => {
  for (const [o, n] of [
    ['', 'hello world'],
    ['alpha beta', 'alpha beta gamma'],
    ['the quick fox', 'the slow fox'],
    ['a\n\n### H\n- one', 'a\n\n### H\n- one\n- two'],
  ]) assert.equal(joinSegs(diffWords(o, n)), n);
});

test('diffWords: empty old -> one added run covering all of new (new section)', () => {
  const segs = diffWords('', 'uma seção inteira nova');
  assert.equal(segs.length, 1);
  assert.equal(segs[0].added, true);
});

test('diffWords: identical -> nothing added', () => {
  assert.ok(diffWords('igual igual', 'igual igual').every((s) => s.added === false));
});

test('diffWords: appended tail is a single added run', () => {
  const added = diffWords('alpha beta', 'alpha beta gamma').filter((s) => s.added);
  assert.equal(added.length, 1);
  assert.equal(added[0].text.trim(), 'gamma');
});

test('diffWords: changed middle word marks only that word', () => {
  const added = diffWords('the quick fox', 'the slow fox').filter((s) => s.added).map((s) => s.text).join('');
  assert.ok(added.includes('slow'));
  assert.ok(!added.includes('the') && !added.includes('fox'));
});
