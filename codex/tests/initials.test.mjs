// js/initials.js — THE avatar initials rule. Élder's rule, locked (his sketch of the people list
// reads "AM  Ariovaldo Rocha Macedo": first + LAST, the way a Brazilian name reads).
//
// This test replaces names.test.mjs. There were TWO modules exporting `initials` with DIFFERENT
// rules — js/names.js (first+last, used by the roster) and js/initials.js (first+SECOND, used by
// the trail header, the forum and the dossiê) — so one person could be "AM" in one place and "AR"
// in another. One module now, one rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initials } from '../js/initials.js';

test('two or more names: first + LAST initial', () => {
  assert.equal(initials('Nelson Madeira'), 'NM');
  assert.equal(initials('Celda Fontes'), 'CF');
  // The case that made the two modules disagree: a middle name must be skipped, not taken.
  assert.equal(initials('Ariovaldo Rocha Macedo'), 'AM');
  assert.equal(initials('Maiana Alves Pessoa'), 'MP');
});

test('a single name uses its first two letters', () => {
  assert.equal(initials('Otavio'), 'OT');
  assert.equal(initials('Cleo'), 'CL');
});

test('blank gives nothing, so the caller renders no initials', () => {
  assert.equal(initials(''), '');
  assert.equal(initials('   '), '');
  assert.equal(initials(null), '');
  assert.equal(initials(undefined), '');
});

test('always uppercase, and stray whitespace never becomes an initial', () => {
  assert.equal(initials('maiana alves pessoa'), 'MP');
  assert.equal(initials('  Cleo   Pire  '), 'CP');
});

test('a one-letter name does not crash or pad', () => {
  assert.equal(initials('A'), 'A');
  assert.equal(initials('A B'), 'AB');
});
