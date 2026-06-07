// composer-class.test.mjs — the "question class" facet of the composer.
// buildPayload carries an audience tag for the "unique" class and null for
// generic/variable, and setAudienceConfig is exported so the bank/live host can
// push the audience matrix into the (module-scoped) composer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPayload, setAudienceConfig } from '../questions/question-composer.js';

test('buildPayload tags audience for unique, null otherwise', () => {
  const base = { type: 'mc', question: 'Q', options: ['a', 'b'], correct: [0] };
  assert.equal(buildPayload(Object.assign({}, base, { audience: 'advocacia' })).audience, 'advocacia');
  assert.equal(buildPayload(Object.assign({}, base, { audience: null })).audience, null);
  assert.equal(buildPayload(base).audience, null, 'no audience field -> null');
  assert.equal(buildPayload(Object.assign({}, base, { audience: '' })).audience, null, 'empty audience -> null');
});

test('buildPayload keeps the existing fields intact alongside audience', () => {
  const out = buildPayload({ type: 'mc', question: 'Q', options: ['a', 'b', 'c'], correct: [2], maxSelect: 1 });
  assert.equal(out.type, 'mc');
  assert.deepEqual(out.options, ['a', 'b', 'c']);
  assert.equal(out.correct_answer, 2);
  assert.equal(out.max_select, 1);
});

test('setAudienceConfig is exported and accepts a config or null', () => {
  assert.equal(typeof setAudienceConfig, 'function');
  setAudienceConfig({ version: 1, variables: ['deliverable'], audiences: {} });
  setAudienceConfig(null);
});
