// codex/js/aula-status.js — the ONE rule for an aula's date status, shared by the
// admin Cohorts view, the public Trail, and Releases. An aula is 'happened' only
// when happened_on is set OR its scheduled day has fully passed (the day after);
// on the scheduled day itself it is still scheduled/rescheduled. This is the source
// of truth; the per-consumer mapping tests (cohorts-aula-date, trilha-page,
// releases-module) only check that each surface maps this status correctly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aulaStatus } from '../js/aula-status.js';

const TODAY = '2026-06-15';
const YESTERDAY = '2026-06-14';
const TOMORROW = '2026-06-16';

test('happened_on wins regardless of the scheduled date', () => {
  assert.equal(aulaStatus({ happened_on: '2026-06-01', scheduled_for: TOMORROW }, TODAY), 'happened');
});

test('scheduled for today is still scheduled, NOT happened (the bug)', () => {
  assert.equal(aulaStatus({ scheduled_for: TODAY }, TODAY), 'scheduled');
});

test('scheduled in the future is scheduled', () => {
  assert.equal(aulaStatus({ scheduled_for: TOMORROW }, TODAY), 'scheduled');
});

test('happened only the day after the scheduled date', () => {
  assert.equal(aulaStatus({ scheduled_for: YESTERDAY }, TODAY), 'happened');
});

test('rescheduled to today (or later) is rescheduled', () => {
  assert.equal(aulaStatus({ scheduled_for: TODAY, rescheduled_from: '2026-06-01' }, TODAY), 'rescheduled');
});

test('rescheduled but the new date already passed is happened', () => {
  assert.equal(aulaStatus({ scheduled_for: YESTERDAY, rescheduled_from: '2026-06-01' }, TODAY), 'happened');
});

test('no dates, or no aula, -> undefined', () => {
  assert.equal(aulaStatus({}, TODAY), 'undefined');
  assert.equal(aulaStatus(null, TODAY), 'undefined');
});
