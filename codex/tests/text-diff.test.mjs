// Word-level diff used by the apostila working-copy preview to mark ONLY the edited runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markChanges, stripMarks, DIFF_OPEN, DIFF_CLOSE } from '../js/text-diff.js';

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
