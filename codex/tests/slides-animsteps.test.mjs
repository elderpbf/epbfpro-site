// Phase 7 reveal-plan core: the ordered slide.build model. Pure, no DOM. Locks the auto
// default (unchanged when build is absent), the per-deck item-a-item / unit grouping, the
// include/exclude of singletons, reorder, and the materialization seed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  singletonKey, listKey, parseListKey, planSteps, seedBuild, moveKey,
  listModeOf, keyOfList, isAnimated,
} from '../content/slides/js/render/animsteps.js';

// A little slide: title (fixed by default), 2 topics, one image, in DOM order.
const els = () => [
  { list: null, key: 'f:title', def: false },   // free text box: fixed by default
  { list: 'topics', key: null, def: true },      // topic 1
  { list: 'topics', key: null, def: true },      // topic 2
  { list: null, key: 'f:hero', def: true },      // image slot
];

test('key helpers round-trip', () => {
  assert.equal(singletonKey('asset', 'a1'), 'a:a1');
  assert.equal(singletonKey('topic', 'topics.t1'), 'f:topics.t1');
  assert.equal(listKey('topics', 'unit'), 'unit:topics');
  assert.equal(listKey('cards', 'each'), 'each:cards');
  assert.deepEqual(parseListKey('unit:topics'), { list: 'topics', mode: 'unit' });
  assert.equal(parseListKey('a:a1'), null);
});

test('auto (no build): every default block one-by-one in DOM order; text box stays fixed', () => {
  const { steps, count } = planSteps(els(), undefined);
  assert.deepEqual(steps, [0, 1, 2, 3]); // title fixed (0), topics + image animate
  assert.equal(count, 3);
});

test('deck unit: the whole topics list reveals in ONE shared step', () => {
  const build = ['unit:topics', 'f:hero'];
  const { steps, count } = planSteps(els(), build);
  assert.deepEqual(steps, [0, 1, 1, 2]); // both topics = step 1, image = step 2
  assert.equal(count, 2);
});

test('deck each keeps per-item steps; reorder puts the image before the topics', () => {
  const build = ['f:hero', 'each:topics'];
  const { steps, count } = planSteps(els(), build);
  assert.deepEqual(steps, [0, 2, 3, 1]); // image first (1), then topic1 (2), topic2 (3)
  assert.equal(count, 3);
});

test('excluding a key: a block absent from build is immediate; opting a text box in animates it', () => {
  // topics excluded entirely, only the image animates
  assert.deepEqual(planSteps(els(), ['f:hero']).steps, [0, 0, 0, 1]);
  // the title (def false) opted in -> it now takes a step
  assert.deepEqual(planSteps(els(), ['f:title', 'each:topics']).steps, [1, 2, 3, 0]);
});

test('empty build animates nothing (explicit), distinct from absent build', () => {
  assert.equal(planSteps(els(), []).count, 0);
  assert.equal(planSteps(els(), undefined).count, 3);
});

test('seedBuild snapshots the auto order: one each:<list> per list, singletons by key, text boxes omitted', () => {
  assert.deepEqual(seedBuild(els()), ['each:topics', 'f:hero']);
});

test('moveKey shifts a unit and is a no-op at the ends', () => {
  const b = ['each:topics', 'f:hero'];
  assert.deepEqual(moveKey(b, 'f:hero', -1), ['f:hero', 'each:topics']);
  assert.deepEqual(moveKey(b, 'each:topics', -1), ['each:topics', 'f:hero']); // already first
  assert.deepEqual(moveKey(b, 'nope', 1), b); // unknown key
});

test('readers: listModeOf, keyOfList, isAnimated', () => {
  assert.equal(listModeOf(undefined, 'topics'), 'each'); // auto reads as each
  assert.equal(listModeOf(['unit:topics'], 'topics'), 'unit');
  assert.equal(listModeOf(['f:hero'], 'topics'), 'none'); // present build, list absent
  assert.equal(keyOfList(['unit:topics'], 'topics'), 'unit:topics');
  assert.equal(keyOfList(undefined, 'topics'), null);
  assert.equal(isAnimated(undefined, 'a:a1', true), true);   // auto default
  assert.equal(isAnimated(undefined, 'f:title', false), false);
  assert.equal(isAnimated(['a:a1'], 'a:a1', false), true);   // explicitly in build
  assert.equal(isAnimated(['x'], 'a:a1', true), false);      // explicitly out
});
