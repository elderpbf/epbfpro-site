// slides-timing.test.mjs — Phase 9 timing: planSteps merges a unit marked timing:"with"
// into the PREVIOUS unit's step (they enter together), and is unchanged without buildFx.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSteps } from '../content/slides/js/render/animsteps.js';

test('planSteps: a singleton timing:"with" shares the previous unit step (enter together)', () => {
  const els = [{ list: null, key: 'f:title', def: false }, { list: null, key: 'a:img', def: true }];
  const { steps, count } = planSteps(els, ['f:title', 'a:img'], { 'a:img': { timing: 'with' } });
  assert.deepEqual(steps, [1, 1], 'title + image share step 1');
  assert.equal(count, 1, 'one reveal step total');
});

test('planSteps: "with" on the first unit still takes its own step (nothing to merge into)', () => {
  const els = [{ list: null, key: 'a:img', def: true }];
  const { steps, count } = planSteps(els, ['a:img'], { 'a:img': { timing: 'with' } });
  assert.deepEqual(steps, [1]);
  assert.equal(count, 1);
});

test('planSteps: no buildFx behaves exactly like before (each unit its own step)', () => {
  const els = [{ list: null, key: 'a:x', def: true }, { list: null, key: 'a:y', def: true }];
  const { steps, count } = planSteps(els, ['a:x', 'a:y']);
  assert.deepEqual(steps, [1, 2]);
  assert.equal(count, 2);
});

test('planSteps: a "unit:" list marked "with" merges into the previous step', () => {
  const els = [
    { list: null, key: 'a:x', def: true },
    { list: 'cards', key: null, def: true },
    { list: 'cards', key: null, def: true },
  ];
  const { steps, count } = planSteps(els, ['a:x', 'unit:cards'], { 'unit:cards': { timing: 'with' } });
  assert.deepEqual(steps, [1, 1, 1], 'the whole card list joins step 1');
  assert.equal(count, 1);
});
