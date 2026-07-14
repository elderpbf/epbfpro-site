// students-filters.js — Alunos roster filter presence rules (track-28a2). Élder's rule:
// "don't show options that none have, for all filters." Locked.
import { test } from 'node:test';
import assert from 'node:assert';
import { hasStatus, hasPending, filterOptions } from '../cohorts/students-filters.js';

const mk = (turmas, email_verified = 1) => ({ turmas, turma_count: turmas.length, email_verified });

test('hasStatus / hasPending read across a person\'s turmas', () => {
  const s = mk([{ access_status: 'approved' }, { access_status: 'pending' }]);
  assert.equal(hasStatus(s, 'pending'), true);
  assert.equal(hasStatus(s, 'denied'), false);
  assert.equal(hasPending(s), true);
  assert.equal(hasPending(mk([{ access_status: 'approved' }])), false);
});

test('a filter with a single bucket is dropped entirely', () => {
  const all = [
    mk([{ access_status: 'approved', client_slug: 'c1' }]),
    mk([{ access_status: 'approved', client_slug: 'c1' }]),
  ];
  const o = filterOptions(all);
  assert.deepEqual(o.status, []);   // only 'approved' present
  assert.deepEqual(o.verified, []); // only verified
  assert.deepEqual(o.turmas, []);   // only single-turma
  assert.deepEqual(o.clients, []);  // only c1
});

test('a filter is kept when at least two buckets are present', () => {
  const list = [
    mk([{ access_status: 'pending', client_slug: 'c1' }], 1),
    mk([{ access_status: 'approved', client_slug: 'c2' }], 0),
  ];
  const o = filterOptions(list);
  assert.ok(o.status.includes('pending') && o.status.includes('approved'));
  assert.deepEqual(o.verified.slice().sort(), ['no', 'yes']);
  assert.deepEqual(o.clients, ['c1', 'c2']);
  assert.deepEqual(o.turmas, []); // both single-turma -> dropped
});

test('approved bucket means no pending and no denied anywhere', () => {
  const mixed = mk([{ access_status: 'approved' }, { access_status: 'denied' }]);
  assert.equal(hasPending(mixed), true);
  const o = filterOptions([mixed, mk([{ access_status: 'approved' }])]);
  assert.ok(o.status.includes('denied'));   // from mixed
  assert.ok(o.status.includes('approved')); // from the clean one
  assert.ok(!o.status.includes('pending')); // nobody is plain-pending
});

test('multi-turma bucket appears alongside single', () => {
  const o = filterOptions([
    mk([{ access_status: 'approved', client_slug: 'c1' }]),
    mk([{ access_status: 'approved', client_slug: 'c1' }, { access_status: 'approved', client_slug: 'c1' }]),
  ]);
  assert.deepEqual(o.turmas.slice().sort(), ['multi', 'single']);
});
