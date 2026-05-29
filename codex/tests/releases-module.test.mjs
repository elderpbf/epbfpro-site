// Releases sub-module: tab contract + the pure release-diff and date-status
// rules that drive the composer's save. Importing must not touch DOM/globals.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const rel = await import('../content/releases.js');

test('releases module satisfies the tab contract', () => {
  assert.equal(typeof rel.mount, 'function', 'exports mount');
  assert.equal(typeof rel.unmount, 'function', 'exports unmount');
});

test('aulaDateStatusKey classifies lesson dates against today', () => {
  const today = '2026-05-29';
  assert.equal(rel.aulaDateStatusKey({ happened_on: '2026-05-01' }, today).key, 'happened');
  assert.equal(rel.aulaDateStatusKey({ scheduled_for: '2026-06-10' }, today).key, 'scheduled', 'future = scheduled');
  assert.equal(rel.aulaDateStatusKey({ scheduled_for: '2026-05-01' }, today).key, 'happened', 'past scheduled = happened');
  assert.equal(rel.aulaDateStatusKey({ scheduled_for: '2026-06-10', rescheduled_from: '2026-05-20' }, today).key, 'rescheduled');
  assert.equal(rel.aulaDateStatusKey({}, today).key, 'tbd', 'no dates = tbd');
});

test('diffAulaSelection splits release / move-into / drop-out', () => {
  // item 1: not released anywhere, now checked -> release (+set aula)
  // item 2: released in aula 5 already, now checked here (aula 3) -> move (setAula)
  // item 3: bound to this aula (3), now unchecked -> drop
  // item 4: bound to this aula (3), still checked -> no-op
  const released = [2, 3, 4];
  const releasedMeta = { 2: { aula_number: 5 }, 3: { aula_number: 3 }, 4: { aula_number: 3 } };
  const out = rel.diffAulaSelection({
    released, releasedMeta, aulaNum: 3, poolIds: [1, 2, 3, 4], selectedIds: [1, 2, 4],
  });
  assert.deepEqual(out.toRelease, [1], 'unreleased+checked -> release');
  assert.deepEqual(out.toSetAula, [2], 'released-elsewhere+checked -> move');
  assert.deepEqual(out.toDropAula, [3], 'bound+unchecked -> drop');
});

test('diffOutrosSelection releases new picks and unreleases dropped Outros items', () => {
  // item 1: not released, now checked -> release
  // item 2: in Outros (released, no aula), now unchecked -> unrelease
  // item 3: released to aula 4 (not Outros), unchecked -> untouched
  const released = [2, 3];
  const releasedMeta = { 2: { aula_number: null }, 3: { aula_number: 4 } };
  const out = rel.diffOutrosSelection({
    released, releasedMeta, poolIds: [1, 2, 3], selectedIds: [1],
  });
  assert.deepEqual(out.toRelease, [1], 'unreleased+checked -> release');
  assert.deepEqual(out.toUnrelease, [2], 'in-Outros+unchecked -> unrelease');
});
