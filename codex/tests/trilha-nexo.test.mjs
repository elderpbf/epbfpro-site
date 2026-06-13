// codex/trilha/js/nexo-answer.js — pure helpers of the de-forked live-answer
// orchestrator. The mounted DOM + the <codex-question> live render are verified
// on staging (and the element itself is covered by question-element.test.mjs /
// questions-unmount.test.mjs); here we pin the audience-label normalization and
// the submit-dispatch mapping that decides which answer call fires.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audienceLabel, submitDispatch } from '../trilha/js/nexo-answer.js';

test('audienceLabel: anon device handles collapse to Anônimo', () => {
  assert.equal(audienceLabel('Anon_AB12CD'), 'Anônimo');
  assert.equal(audienceLabel('anon-xyz'), 'Anônimo');
  assert.equal(audienceLabel('ANON_ZZ'), 'Anônimo');
  assert.equal(audienceLabel('Anônimo'), 'Anônimo');
  assert.equal(audienceLabel(''), 'Anônimo');
  assert.equal(audienceLabel(null), 'Anônimo');
  assert.equal(audienceLabel(undefined), 'Anônimo');
  assert.equal(audienceLabel('   '), 'Anônimo');
});

test('audienceLabel: a typed/real name shows, trimmed', () => {
  assert.equal(audienceLabel('Maria'), 'Maria');
  assert.equal(audienceLabel('  João Silva  '), 'João Silva');
  // a real name that merely contains "anon" mid-word is not an anon handle
  assert.equal(audienceLabel('Anonimato Coletivo'), 'Anonimato Coletivo');
});

test('submitDispatch: maps the element onSubmit detail to a submit kind', () => {
  assert.deepEqual(submitDispatch({ type: 'indices', value: [0, 2] }), { kind: 'multi', value: [0, 2] });
  const el = { tag: 'btn' };
  assert.deepEqual(submitDispatch({ type: 'index', value: 1, el }), { kind: 'index', value: 1, el });
  assert.deepEqual(submitDispatch({ type: 'value', value: 'hello' }), { kind: 'value', value: 'hello' });
});

test('submitDispatch: anything not indices/index falls back to value', () => {
  assert.deepEqual(submitDispatch({ type: 'open', value: 'x' }), { kind: 'value', value: 'x' });
  assert.equal(submitDispatch(null), null);
  assert.equal(submitDispatch(undefined), null);
});
