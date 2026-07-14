// names.js — avatar initials (track-28a2). Élder's rule, locked.
import { test } from 'node:test';
import assert from 'node:assert';
import { initials } from '../js/names.js';

test('initials: first+last initial, or first two letters for a single name', () => {
  assert.equal(initials('Nelson Madeira'), 'NM');
  assert.equal(initials('Otavio'), 'OT');
  assert.equal(initials('Celda Fontes'), 'CF');
  assert.equal(initials(''), '?');
});
