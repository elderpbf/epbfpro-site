// slides-derive.test.mjs — the pure colour DERIVATION (theme/derive.js): the first
// step of the Tema system, where slide panels stop being hardcoded and start
// following the palette. DOM-free, node:test, assert-by-source-text (the values are
// CSS color-mix expressions the browser resolves).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { derive } from '../content/slides/js/theme/derive.js';

test('derive returns exactly the panel token family', () => {
  const d = derive({ accent: '#14b8a6', ink: '#134e4a', paper: '#ffffff' });
  assert.deepEqual(Object.keys(d).sort(), ['--panel-fill', '--panel-fill-2', '--panel-grad', '--panel-line']);
});
test('panel tokens are color-mix washes of the accent over paper (so they follow the swatch)', () => {
  const d = derive({ accent: '#14b8a6', paper: '#ffffff' });
  assert.match(d['--panel-fill'], /color-mix\(in srgb, #14b8a6 6%, #ffffff\)/);
  assert.match(d['--panel-fill-2'], /#14b8a6 11%/);
  assert.match(d['--panel-line'], /#14b8a6 16%/);
});
test('the gradient composes the two fill stops', () => {
  const d = derive({ accent: '#14b8a6', paper: '#ffffff' });
  assert.match(d['--panel-grad'], /^linear-gradient\(160deg, color-mix.+, color-mix.+\)$/);
  assert.ok(d['--panel-grad'].includes(d['--panel-fill']));
  assert.ok(d['--panel-grad'].includes(d['--panel-fill-2']));
});
test('changing the accent changes the derived fills (nothing is hardcoded teal)', () => {
  const teal = derive({ accent: '#14b8a6', paper: '#ffffff' });
  const blue = derive({ accent: '#3b82f6', paper: '#ffffff' });
  assert.notEqual(teal['--panel-fill'], blue['--panel-fill']);
  assert.match(blue['--panel-fill'], /#3b82f6/);
});
test('token names do NOT collide with the editor-chrome --panel / --panel-2', () => {
  const keys = Object.keys(derive({ accent: '#14b8a6' }));
  assert.ok(!keys.includes('--panel'), 'must not shadow the chrome --panel');
  assert.ok(!keys.includes('--panel-2'), 'must not shadow the chrome --panel-2');
});
test('falls back to teal accent + white paper when fields are missing (legacy-safe)', () => {
  assert.match(derive({})['--panel-fill'], /#14b8a6 6%, #ffffff/);
  assert.match(derive({ accent: '#3b82f6' })['--panel-fill'], /#3b82f6 6%, #ffffff/);
});
